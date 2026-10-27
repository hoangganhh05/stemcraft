"""Backend worker: approved local profile, bounded CPU inference, atomic WAV publish."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def atomic_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2), encoding='utf-8')
    os.replace(temporary, path)


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def validate_folder(value):
    original = Path(value).absolute()
    folder = original.resolve(strict=True)
    if folder != original or folder.name != str(uuid.UUID(folder.name, version=4)):
        raise ValueError('Invalid job directory')
    if not any(folder.is_relative_to((ROOT / item).resolve()) for item in ('storage', '.cache')):
        raise ValueError('Job directory outside private storage')
    source = folder / 'input.upload'
    if source.is_symlink() or not source.is_file():
        raise ValueError('Missing or unsafe input')
    return folder


def infer(args, folder):
    import numpy as np
    import soundfile as sf
    import torch
    from audio_separator.separator import Separator

    profile = json.loads((ROOT / 'config/ai-profile.json').read_text(encoding='utf-8'))
    checkpoint = ROOT / 'models' / profile['checkpoint_filename']
    if checkpoint.name != profile['checkpoint_filename']:
        raise RuntimeError('Invalid checkpoint path')
    yaml = checkpoint.with_suffix('.yaml')
    for path, expected in [(checkpoint, profile['checkpoint_sha256']), (yaml, profile['yaml_sha256'])]:
        if not path.is_file() or sha256(path) != expected:
            raise RuntimeError('Model missing or hash mismatch; downloads are disabled')
    torch.set_num_threads(profile['threads'])
    decoded = folder / 'decoded.wav'
    atomic_json(folder / 'progress.json', {'stage': 'DECODING', 'completed_chunks': 0, 'total_chunks': 0})
    subprocess.run([os.environ.get('FFMPEG_BINARY', 'ffmpeg'), '-nostdin', '-v', 'error', '-n',
                    '-i', str(folder / 'input.upload'), '-map', '0:a:0', '-t', str(args.max_duration + 0.1),
                    '-ac', str(profile['channels']), '-ar', str(profile['sample_rate']),
                    '-c:a', 'pcm_s16le', str(decoded)], check=True, timeout=120,
                   stdin=subprocess.DEVNULL)
    info = sf.info(decoded)
    if not 0.5 <= info.duration <= args.max_duration or info.channels != 2 or info.samplerate != 44100:
        raise RuntimeError('Decoded audio failed validation')
    partial = folder / 'partial'
    partial.mkdir()
    separator = Separator(model_file_dir=str(ROOT / 'models'), output_dir=str(partial),
                          output_format='WAV', use_soundfile=True, use_autocast=False,
                          normalization_threshold=profile['normalization_threshold'],
                          mdxc_params=profile['inference_config'])
    # This profile is explicitly CPU FP32, even if moved to a CUDA-capable host.
    separator.setup_torch_device = lambda _system: None
    separator.torch_device = torch.device('cpu')
    separator.torch_device_cpu = torch.device('cpu')
    separator.onnx_execution_provider = ['CPUExecutionProvider']
    separator.load_model(model_filename=checkpoint.name)
    instance = separator.model_instance
    chunk_size = 441 * (profile['inference_config']['segment_size'] - 1)
    starts = instance._roformer_chunk_starts(info.frames, chunk_size,
                                            chunk_size // profile['inference_config']['overlap'])
    progress = {'stage': 'SEPARATING', 'completed_chunks': 0, 'total_chunks': len(starts)}
    atomic_json(folder / 'progress.json', progress)
    original_model = instance._run_roformer_model
    original_writer = instance.write_audio

    def model(part):
        result = original_model(part)
        if not torch.isfinite(result).all():
            raise RuntimeError('Nonfinite inference output')
        progress['completed_chunks'] += 1
        atomic_json(folder / 'progress.json', progress)
        return result

    def writer(path, data):
        if not np.isfinite(data).all():
            raise RuntimeError('Nonfinite data before encoding')
        return original_writer(path, data)

    instance._run_roformer_model = model
    instance.write_audio = writer
    outputs = separator.separate(str(decoded), custom_output_names={'Vocals': 'vocals_raw', 'Instrumental': 'instrumental'})
    progress['stage'] = 'VALIDATING'
    atomic_json(folder / 'progress.json', progress)
    if len(outputs) != 2 or progress['completed_chunks'] != len(starts):
        raise RuntimeError('Incomplete separation')
    metadata = []
    for filename in ['vocals_raw.wav', 'instrumental.wav']:
        path = partial / filename
        metadata.append(validate_output(path, info.frames))
    atomic_json(folder / 'output-metadata.json', {'profile': profile, 'duration_seconds': info.duration,
                                                 'outputs': metadata})
    partial.rename(folder / 'stems')
    progress['stage'] = 'COMPLETED'
    atomic_json(folder / 'progress.json', progress)


def validate_output(path, expected_frames):
    """Validate exported PCM before publishing; block reads bound memory usage."""
    import numpy as np
    import soundfile as sf
    output = sf.info(path)
    if output.format != 'WAV' or output.frames != expected_frames or output.frames <= 0 or output.channels != 2 or output.samplerate != 44100:
        raise RuntimeError('Output frames/rate/channels mismatch')
    peak = 0.0
    for block in sf.blocks(path, blocksize=44100 * 5, dtype='float32', always_2d=True):
        if not np.isfinite(block).all():
            raise RuntimeError('Nonfinite WAV')
        peak = max(peak, float(np.max(np.abs(block))))
    if not 0 < peak < 1:
        raise RuntimeError('Silent or clipped WAV')
    return {'file': path.name, 'frames': output.frames, 'sample_rate': output.samplerate,
            'channels': output.channels, 'peak': peak, 'sha256': sha256(path)}


def supervise(args, folder, child_command=None):
    import psutil
    parent = psutil.Process(args.owner_pid or os.getppid())
    parent_started = parent.create_time()
    lock = (ROOT / '.cache/backend-inference.lock').open('a+b')
    if lock.seek(0, 2) == 0:
        lock.write(b'0')
        lock.flush()
    deadline = time.monotonic() + 30
    while True:
        try:
            lock.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except OSError:
            if time.monotonic() >= deadline:
                raise RuntimeError('Another inference worker is still active')
            time.sleep(1)
    started = time.monotonic()
    command = child_command or [sys.executable, str(Path(__file__).resolve()), '--child', '--job-dir', str(folder),
               '--max-duration', str(args.max_duration)]
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL)
    process = psutil.Process(child.pid)
    peak = 0.0
    minimum_available = float('inf')
    failure = None
    try:
        while child.poll() is None:
            try:
                if not parent.is_running() or parent.create_time() != parent_started:
                    failure = 'WORKER_INTERRUPTED'
                    break
                family = [process] + process.children(recursive=True)
                rss = 0
                for item in family:
                    try:
                        rss += item.memory_info().rss
                    except psutil.NoSuchProcess:
                        pass
                peak = max(peak, rss / 1024 ** 2)
                available = psutil.virtual_memory().available / 1024 ** 2
                minimum_available = min(minimum_available, available)
                if peak > args.memory_mib or available < 256:
                    failure = 'MEMORY_LIMIT'
                    break
                if time.monotonic() - started > args.timeout:
                    failure = 'TIMEOUT'
                    break
            except psutil.NoSuchProcess:
                # A normal child exit can race the process-tree sample.
                # Its actual exit code and validated output remain authoritative.
                if child.poll() is None:
                    failure = 'WORKER_INTERRUPTED'
                break
            time.sleep(0.5)
    finally:
        if child.poll() is None:
            try:
                family = process.children(recursive=True)
            except psutil.NoSuchProcess:
                family = []
            for item in reversed(family + [process]):
                try:
                    item.kill()
                except psutil.NoSuchProcess:
                    pass
        child.wait()
        lock.close()
    if failure or child.returncode != 0:
        atomic_json(folder / 'progress.json', {'stage': 'FAILED', 'error_code': failure or 'WORKER_FAILED'})
        code = 1
    else:
        code = 0
    atomic_json(folder / 'runtime.json', {'exit_code': child.returncode, 'elapsed_seconds': time.monotonic() - started,
                                        'peak_rss_mib': peak, 'minimum_available_mib': None if minimum_available == float('inf') else minimum_available,
                                        'error_code': failure})
    return code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job-dir', required=True)
    parser.add_argument('--child', action='store_true')
    parser.add_argument('--owner-pid', type=int)
    parser.add_argument('--timeout', type=int, default=43200)
    parser.add_argument('--memory-mib', type=int, default=3500)
    parser.add_argument('--max-duration', type=float, default=600)
    args = parser.parse_args()
    if not 0 < args.timeout <= 43200 or not 0 < args.memory_mib <= 3500 or not 0.5 <= args.max_duration <= 600:
        parser.error('Invalid limits')
    folder = validate_folder(args.job_dir)
    try:
        if args.child:
            infer(args, folder)
            return 0
        return supervise(args, folder)
    except Exception as error:
        print(f'Worker failure: {type(error).__name__}: {error}', file=sys.stderr, flush=True)
        atomic_json(folder / 'progress.json', {'stage': 'FAILED', 'error_code': 'WORKER_FAILED'})
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
