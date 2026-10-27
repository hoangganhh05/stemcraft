"""Epic 7: one same-model fast candidate, never selectable by production API."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import uuid
import wave

from job_worker import ROOT, atomic_json, infer, sha256, supervise, validate_folder

REPORT = ROOT / 'docs/reports/epic-07-fast-experiment.json'
SOURCE = ROOT / 'samples/hoa-sua-justatee-045-070.wav'
BASELINE = ROOT / 'docs/reports/repair-hs-context8s-long25-mel-roformer.json'


def candidate(quality):
    result = deepcopy(quality)
    result.update(id='mel-viperx1143-context8s-overlap2-experimental', quality_accepted_by_user=False,
                  public_release_ready=False, evidence_report=None, accepted_sample_seconds=0,
                  extended_benchmark_waived_by_user=False)
    result['inference_config']['overlap'] = 2
    return result


def call_count(frames, segment, overlap):
    chunk = 441 * (segment - 1)
    if frames <= 0 or chunk <= 0 or overlap not in (2, 4):
        raise ValueError('Invalid chunk plan')
    return 1 + math.ceil(max(0, frames - chunk) / (chunk // overlap))


def plan():
    quality = json.loads((ROOT / 'config/ai-profile.json').read_text(encoding='utf-8'))
    fast = candidate(quality)
    with wave.open(str(SOURCE), 'rb') as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (44100, 2, 2):
            raise RuntimeError('Expected original stereo PCM16/44100 sample')
        frames = audio.getnframes()
        if not 8 < frames / 44100 <= 30:
            raise RuntimeError('Need more than 8 seconds to compare overlap work')
    report = {'generated_at': datetime.now(timezone.utc).isoformat(), 'status': 'PLANNED',
              'input_sha256': sha256(SOURCE), 'frames': frames, 'duration_seconds': frames / 44100,
              'quality_profile': quality, 'fast_profile': fast, 'fast_quality_accepted': False,
              'app_enabled': False, 'measured_speedup': None}
    report['planned_model_calls'] = {
        name: call_count(frames, profile['inference_config']['segment_size'], profile['inference_config']['overlap'])
        for name, profile in [('quality', quality), ('fast', fast)]}
    return report


def package_comparison(folder, report):
    import numpy as np
    import soundfile as sf
    baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
    if (baseline['status'] != 'COMPLETED' or baseline['input_sha256'] != report['input_sha256']
            or baseline['checkpoint_sha256'] != report['quality_profile']['checkpoint_sha256']
            or baseline['config_sha256'] != report['quality_profile']['yaml_sha256']
            or baseline['inference_config'] != report['quality_profile']['inference_config']):
        raise RuntimeError('Baseline does not match input/model/quality profile')
    baseline_folder = (ROOT / baseline['result_dir']).resolve()
    if not baseline_folder.is_relative_to(ROOT / 'results'):
        raise RuntimeError('Unsafe baseline result directory')
    metadata = json.loads((baseline_folder / 'output-metadata.json').read_text(encoding='utf-8'))
    listening = folder / 'listening'
    listening.mkdir()
    report['comparison'] = []
    for stem, fast_name in [('vocals', 'vocals_raw.wav'), ('instrumental', 'instrumental.wav')]:
        entry = next(item for item in metadata if stem in item['file'].lower())
        original_path = baseline_folder / 'stems' / Path(entry['file']).name
        if sha256(original_path) != entry['sha256']:
            raise RuntimeError('Baseline stem hash mismatch')
        paths = [original_path, folder / 'stems' / fast_name]
        signals = []
        for path in paths:
            data, rate = sf.read(path, always_2d=True, dtype='float32')
            if rate != 44100 or data.shape != (report['frames'], 2) or not np.isfinite(data).all():
                raise RuntimeError('A/B format mismatch')
            signals.append(data)
        rms = [float(np.sqrt(np.mean(data.astype('float64') ** 2))) for data in signals]
        if min(rms) <= 0:
            raise RuntimeError('Silent A/B signal')
        # Attenuation only, one gain per entire stem; no per-chunk normalization or denoise.
        gains = [min(rms) / value for value in rms]
        peak = max(float(np.max(np.abs(data))) * gain for data, gain in zip(signals, gains))
        common = min(1.0, 0.95 / peak)
        for label, data, gain in zip(['A_quality', 'B_fast'], signals, gains):
            output = listening / f'{label}_{stem}.wav'
            sf.write(output, data * gain * common, 44100, subtype='PCM_24')
            report['comparison'].append({'file': str(output.relative_to(ROOT)), 'gain': gain * common,
                                         'sha256': sha256(output)})
    report['baseline_runtime_seconds'] = baseline['elapsed_seconds']
    report['timing_comparison_scope'] = 'Historical baseline vs current run; different system load, not a controlled speedup claim'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Run one guarded 25-second experiment')
    parser.add_argument('--child', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.child:
        import shutil
        portable = ROOT / '.tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe'
        binary = os.environ.get('FFMPEG_PATH') or (str(portable) if portable.is_file() else shutil.which('ffmpeg'))
        if not binary:
            raise RuntimeError('FFmpeg unavailable')
        os.environ['FFMPEG_BINARY'] = binary
        os.environ['PATH'] = str(Path(binary).parent) + os.pathsep + os.environ.get('PATH', '')
        folder = validate_folder(args.child)
        quality = json.loads((ROOT / 'config/ai-profile.json').read_text(encoding='utf-8'))
        infer(SimpleNamespace(max_duration=30), folder, profile=candidate(quality))
        return 0
    report = plan()
    if not args.run:
        atomic_json(REPORT, report)
        print(json.dumps(report['planned_model_calls']), 'planned calls; no measured speedup')
        return 0
    import psutil
    report['available_ram_mib'] = round(psutil.virtual_memory().available / 1024 ** 2)
    report['minimum_start_ram_mib'] = 2304
    if report['available_ram_mib'] < report['minimum_start_ram_mib']:
        report.update(status='BLOCKED', reason='INSUFFICIENT_AVAILABLE_RAM')
        atomic_json(REPORT, report)
        print('BLOCKED: insufficient RAM; no model loaded, app profile unchanged.')
        return 2
    folder = ROOT / '.cache' / str(uuid.uuid4())
    folder.mkdir()
    import shutil
    shutil.copyfile(SOURCE, folder / 'input.upload')
    if sha256(folder / 'input.upload') != report['input_sha256']:
        raise RuntimeError('Input changed during copy')
    report['artifact_directory'] = str(folder.relative_to(ROOT))
    report['status'] = 'RUNNING'
    atomic_json(REPORT, report)
    limits = SimpleNamespace(owner_pid=os.getpid(), max_duration=30, timeout=1800, memory_mib=3500)
    try:
        code = supervise(limits, folder, [sys.executable, str(Path(__file__).resolve()), '--child', str(folder)])
        report['runtime'] = json.loads((folder / 'runtime.json').read_text(encoding='utf-8'))
        if code:
            report.update(status='FAILED', reason=json.loads((folder / 'progress.json').read_text())['error_code'])
            return code
        package_comparison(folder, report)
        report['status'] = 'AWAITING_LISTENING'
        print('WAV A/B ready:', folder / 'listening')
        return 0
    except Exception as error:
        report.update(status='FAILED', reason=type(error).__name__)
        raise
    finally:
        atomic_json(REPORT, report)


if __name__ == '__main__':
    raise SystemExit(main())
