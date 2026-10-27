"""Resumable local full-song check using the approved, unchanged separator pipeline."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sys
import time

import smoke_test as engine

ROOT = engine.ROOT
SOURCE = ROOT / "samples/hoa-sua-full.wav"
DEST = ROOT / "results/full-hs-8s"
REPORT = ROOT / "docs/reports/full-hs-8s-mel-roformer.json"
CONFIG = {"segment_size": 801, "override_model_segment_size": True,
          "batch_size": 1, "overlap": 4, "pitch_shift": 0}


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def load_cache(folder, index, input_hash):
    import numpy as np
    data_path = folder / f"{index:04d}.npy"
    record_path = folder / f"{index:04d}.json"
    if not record_path.exists():
        return None
    record = json.loads(record_path.read_text(encoding="utf-8"))
    if record["input_sha256"] != input_hash or engine.sha256(data_path) != record["output_sha256"]:
        raise RuntimeError("Chunk cache input/hash mismatch; refusing to mix runs")
    data = np.load(data_path, allow_pickle=False)
    if data.dtype != np.float32 or data.ndim not in (2, 3) or data.shape[-2] != 2 or list(data.shape) != record["shape"] or not np.isfinite(data).all():
        raise RuntimeError("Invalid chunk cache")
    return data, record


def save_cache(folder, index, input_hash, data, seconds):
    import numpy as np
    if data.dtype != np.float32 or data.ndim not in (2, 3) or data.shape[-2] != 2 or not np.isfinite(data).all():
        raise RuntimeError("Invalid model result before checkpoint")
    path = folder / f"{index:04d}.npy"
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("wb") as handle:
        np.save(handle, data, allow_pickle=False)
    temporary.replace(path)
    record = dict(input_sha256=input_hash, output_sha256=engine.sha256(path),
                  shape=list(data.shape), inference_seconds=seconds)
    atomic_json(folder / f"{index:04d}.json", record)
    return record


def validate_wav(path, frames, rate):
    import numpy as np
    import soundfile as sf
    info = sf.info(path)
    if info.frames != frames or info.samplerate != rate or info.channels != 2:
        raise RuntimeError("WAV frame count/rate/channels mismatch")
    peak, square_sum, count = 0.0, 0.0, 0
    for block in sf.blocks(path, blocksize=rate*5, dtype="float32", always_2d=True):
        if not np.isfinite(block).all():
            raise RuntimeError("Nonfinite WAV")
        peak = max(peak, float(np.max(np.abs(block))))
        square_sum += float(np.sum(np.square(block, dtype=np.float64)))
        count += block.size
    if not 0 < peak < 1:
        raise RuntimeError("Silent or clipped WAV")
    return dict(file=path.name, duration_seconds=frames/rate, sample_rate=rate, frames=frames,
                channels=2, peak=peak, rms=(square_sum/count)**.5, sha256=engine.sha256(path))


def child():
    import hashlib
    import numpy as np
    import soundfile as sf
    import torch
    from audio_separator.separator import Separator

    torch.set_num_threads(2)
    info = sf.info(SOURCE)
    starts = None
    progress = dict(status="LOADING_MODEL", completed_chunks=0, total_chunks=None,
                    source_frames=info.frames, sample_rate=info.samplerate)
    atomic_json(DEST / "progress.json", progress)
    separator = Separator(model_file_dir=str(ROOT / "models"), output_dir=str(DEST / "partial"),
                          output_format="WAV", use_soundfile=True, mdxc_params=CONFIG,
                          normalization_threshold=.9)
    separator.load_model(model_filename=engine.MODEL)
    instance = separator.model_instance
    starts = instance._roformer_chunk_starts(info.frames, 352800, 88200)
    cache = DEST / "chunks"
    cache.mkdir(exist_ok=True)
    original_call = instance._run_roformer_model
    original_writer = instance.write_audio
    records = []

    def instrument(part):
        index = len(records)
        progress.update(status="PROCESSING", current_chunk=index+1,
                        completed_chunks=index, total_chunks=len(starts),
                        current_start_seconds=starts[index]/info.samplerate)
        atomic_json(DEST / "progress.json", progress)
        input_hash = hashlib.sha256(part.detach().cpu().numpy().tobytes()).hexdigest()
        cached = load_cache(cache, index, input_hash)
        if cached is not None:
            data, record = cached
            result = torch.from_numpy(data)
            hit = True
        else:
            began = time.monotonic()
            result = original_call(part)
            if not torch.isfinite(result).all() or result.shape[-1] != part.shape[-1]:
                raise RuntimeError("Nonfinite or short model output")
            record = save_cache(cache, index, input_hash, result.detach().cpu().numpy(), time.monotonic()-began)
            hit = False
        if result.shape[-1] != part.shape[-1]:
            raise RuntimeError("Cached result length mismatch")
        records.append(record)
        progress.update(completed_chunks=len(records), cache_hit=hit,
                        total_inference_seconds=sum(item["inference_seconds"] for item in records))
        atomic_json(DEST / "progress.json", progress)
        print("CHUNK", index+1, "/", len(starts), "cached" if hit else "computed", flush=True)
        return result

    def writer(path, data):
        if not np.isfinite(data).all():
            raise RuntimeError("Nonfinite audio before encoding")
        return original_writer(path, data)

    instance._run_roformer_model = instrument
    instance.write_audio = writer
    outputs = separator.separate(str(SOURCE))
    if len(records) != len(starts) or len(outputs) != 2:
        raise RuntimeError("Incomplete separation")
    coverage = np.zeros(info.frames, dtype=np.uint8)
    for index in starts:
        coverage[index:index+352800] += 1
    if np.any(coverage == 0):
        raise RuntimeError("Missing audio frames")
    progress.update(status="VALIDATING", uncovered_frames=0, min_coverage=int(coverage.min()),
                    max_coverage=int(coverage.max()))
    atomic_json(DEST / "progress.json", progress)
    metadata = [validate_wav(DEST / "partial" / output, info.frames, info.samplerate) for output in outputs]
    atomic_json(DEST / "output-metadata.json", metadata)
    atomic_json(DEST / "chunk-audit.json", dict(starts=starts, chunk_frames=352800, step_frames=88200,
                                               uncovered_frames=0, min_coverage=int(coverage.min()),
                                               max_coverage=int(coverage.max()), records=records))
    review = DEST / "review"
    review.mkdir(exist_ok=True)
    vocal = next(item for item in metadata if "vocals" in item["file"].lower())
    instrumental = next(item for item in metadata if "instrumental" in item["file"].lower())
    excerpts = []
    with sf.SoundFile(DEST / "partial" / vocal["file"]) as audio:
        for label, seconds in (("early", 30), ("middle", info.duration/2-10), ("late", info.duration-25)):
            start = max(0, round(seconds*info.samplerate))
            audio.seek(start)
            data = audio.read(info.samplerate*20, dtype="float32", always_2d=True)
            sf.write(review / f"vocals_{label}.wav", data, info.samplerate, subtype="PCM_24")
            excerpts.append(dict(file=f"vocals_{label}.wav", start_seconds=start/info.samplerate,
                                 duration_seconds=len(data)/info.samplerate, gain=1))
    atomic_json(review / "excerpts.json", excerpts)
    (DEST / "listen.m3u").write_text(
        "#EXTM3U\n../../samples/hoa-sua-full.wav\n" + f"stems/{vocal['file']}\nstems/{instrumental['file']}\n", encoding="utf-8")
    progress.update(status="VALIDATED_AWAITING_PUBLISH", outputs=metadata)
    atomic_json(DEST / "progress.json", progress)


def status():
    result = {}
    for name, path in (("run", REPORT), ("progress", DEST / "progress.json")):
        if path.exists():
            try:
                result[name] = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                result[name] = {"status": "UPDATING"}
    print(json.dumps(result or {"status": "NOT_STARTED"}, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--timeout", type=int, default=43200)
    args = parser.parse_args()
    if args.status:
        status()
        return 0
    if args.timeout <= 0:
        parser.error("Timeout must be positive")
    engine.MODEL = "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"
    engine.MODEL_KEY, engine.SAMPLE_ID = "mel", "full-hs-8s"
    engine.SOURCE, engine.DEST, engine.CONFIG = SOURCE, DEST, CONFIG
    if args.child:
        child()
        return 0
    import msvcrt
    import importlib.metadata
    import importlib.util
    import hashlib
    import soundfile as sf
    if not SOURCE.is_file():
        parser.error("Prepare samples/hoa-sua-full.wav first")
    if shutil.disk_usage(ROOT).free < 2*1024**3:
        parser.error("Need at least 2 GiB free for checkpoints and WAVs")
    info = sf.info(SOURCE)
    if info.samplerate != 44100 or info.channels != 2 or not 30 < info.duration <= 600:
        parser.error("Expected stereo 44100 Hz full-track WAV, 30–600 seconds")
    DEST.mkdir(exist_ok=True)
    with (DEST / "run.lock").open("a+b") as lock:
        if lock.seek(0, 2) == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise SystemExit("Full-song run already active; use --status")
        if (DEST / "stems").exists():
            status()
            return 0
        package_root = Path(next(iter(importlib.util.find_spec("audio_separator").submodule_search_locations)))
        code_hash = hashlib.sha256()
        for path in sorted(package_root.rglob("*.py")):
            code_hash.update(str(path.relative_to(package_root)).encode())
            code_hash.update(path.read_bytes())
        fingerprint = dict(input_sha256=engine.sha256(SOURCE), separator_code_sha256=code_hash.hexdigest(),
                           runner_sha256=engine.sha256(Path(__file__).resolve()),
                           checkpoint_sha256=engine.sha256(ROOT / "models" / engine.MODEL),
                           yaml_sha256=engine.sha256((ROOT / "models" / engine.MODEL).with_suffix(".yaml")),
                           separator=importlib.metadata.version("audio-separator"),
                           torch=importlib.metadata.version("torch"), config=CONFIG,
                           threads=2, precision="fp32", normalization_threshold=.9)
        manifest = DEST / "fingerprint.json"
        if manifest.exists() and json.loads(manifest.read_text()) != fingerprint:
            raise SystemExit("Run fingerprint changed; refusing to reuse checkpoints")
        atomic_json(manifest, fingerprint)
        if REPORT.exists():
            attempts = DEST / "attempts"
            attempts.mkdir(exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            shutil.copyfile(REPORT, attempts / f"{stamp}.json")
        code = engine.supervise(args.timeout, 3500,
            [sys.executable, str(Path(__file__).resolve()), "--child"], resume=True)
        if code == 0:
            progress = json.loads((DEST / "progress.json").read_text())
            progress["status"] = "COMPLETED"
            atomic_json(DEST / "progress.json", progress)
            run = json.loads(REPORT.read_text())
            text = (
                "# Full-track Hoa sua check\n\nTechnical validation: PASS. Listening review pending.\n\n"
                f"Duration: {info.duration:.6f} s; frames: {info.frames}; stereo 44100 Hz.\n\n"
                f"Configuration: Mel Viperx 1143, segment 801, overlap 4, CPU FP32 / 2 threads.\n\n"
                f"Latest attempt: {run['elapsed_seconds']:.2f} s; peak RSS: {run['peak_rss_mib']:.2f} MiB.\n\n"
                f"Chunks: {progress['completed_chunks']}; missing frames: 0.\n\n"
                "Outputs and hashes: results/full-hs-8s/output-metadata.json.\n"
                "Listen: results/full-hs-8s/listen.m3u; excerpts: review/.\n\n"
                "No NaN/Inf before encoding; full WAVs validated for length/rate/channels/clipping.\n"
                "No gate/denoise. Same library overlap-add, no per-chunk normalization.\n"
                "Float32 chunk cache is lossless and checked against input/model/config fingerprints.\n"
                "No SDR/SI-SDR or subjective intelligibility scores claimed. No application built.\n")
            (ROOT / "docs/reports/full-track-hoa-sua.md").write_text(text, encoding="utf-8")
        return code


if __name__ == "__main__":
    raise SystemExit(main())
