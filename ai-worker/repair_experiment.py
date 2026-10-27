"""Instrumented same-checkpoint experiment. Never modifies site-packages or old outputs."""
import argparse
import json
from pathlib import Path
import sys
import time
import re

import smoke_test as engine

PROFILES = {"legacy": (64, 1), "context4s": (401, 2), "context8s": (801, 4)}
SOURCE = engine.ROOT / "samples/repair-hoa-sua-8s.wav"


def run_child():
    import numpy as np
    import soundfile as sf
    import torch
    from audio_separator.separator import Separator

    torch.set_num_threads(2)
    source, rate = sf.read(SOURCE, dtype="float32", always_2d=True)
    if rate != 44100 or source.shape[1] != 2 or not np.isfinite(source).all():
        raise RuntimeError("Expected finite stereo 44100 Hz input")
    audit = {"input_frames": len(source), "sample_rate": rate, "input_peak": float(np.max(np.abs(source))),
             "input_dtype": str(source.dtype), "chunks": [], "exports": []}
    separator = Separator(model_file_dir=str(engine.ROOT / "models"), output_dir=str(engine.DEST / "partial"),
                          output_format="WAV", use_soundfile=True, mdxc_params=engine.CONFIG,
                          normalization_threshold=0.9)
    separator.load_model(model_filename=engine.MODEL)
    instance = separator.model_instance
    original_model_call = instance._run_roformer_model
    original_writer = instance.write_audio

    def instrument(part):
        started = time.monotonic()
        result = original_model_call(part)
        if not torch.isfinite(result).all():
            raise RuntimeError("Model generated NaN/Inf before export")
        record = {"input_frames": part.shape[-1], "output_frames": result.shape[-1],
                  "seconds": time.monotonic() - started, "peak": float(result.abs().max())}
        audit["chunks"].append(record)
        print("CHUNK", json.dumps(record), flush=True)
        return result

    def writer(path, data):
        if not np.isfinite(data).all():
            raise RuntimeError("NaN/Inf before WAV encoding")
        audit["exports"].append({"path": str(path), "shape": list(data.shape), "dtype": str(data.dtype),
                                 "peak_before_encoding": float(np.max(np.abs(data)))})
        return original_writer(path, data)

    instance._run_roformer_model = instrument
    instance.write_audio = writer
    outputs = separator.separate(str(SOURCE))
    metadata = []
    for output in outputs:
        path = engine.DEST / "partial" / output
        data, sr = sf.read(path, always_2d=True)
        if sr != rate or data.shape != source.shape or not np.isfinite(data).all():
            raise RuntimeError("Output shape/rate/nonfinite mismatch")
        peak = float(np.max(np.abs(data)))
        if not 0 < peak < 1:
            raise RuntimeError("Silent or clipped output")
        metadata.append(dict(file=Path(output).name, duration_seconds=len(data)/sr, sample_rate=sr,
                             channels=data.shape[1], peak=peak, rms=float(np.sqrt(np.mean(data**2))),
                             sha256=engine.sha256(path)))
    if len(metadata) != 2:
        raise RuntimeError("Expected two stems")
    chunk_size = 441 * (engine.CONFIG["segment_size"] - 1)
    starts = instance._roformer_chunk_starts(len(source), chunk_size, chunk_size // engine.CONFIG["overlap"])
    coverage = np.zeros(len(source), dtype=np.int32)
    if len(starts) != len(audit["chunks"]):
        raise RuntimeError("Unexpected chunk schedule")
    for start, chunk in zip(starts, audit["chunks"]):
        coverage[start:start + min(chunk["input_frames"], chunk["output_frames"])] += 1
    audit.update(chunk_starts=starts, uncovered_frames=int(np.count_nonzero(coverage == 0)),
                 min_coverage=int(coverage.min()), max_coverage=int(coverage.max()))
    if audit["uncovered_frames"]:
        raise RuntimeError("Uncovered audio frames in overlap-add")
    (engine.DEST / "chunk-audit.json").write_text(json.dumps(audit, indent=2), encoding="utf-8")
    (engine.DEST / "output-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main():
    global SOURCE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=PROFILES, default="context8s")
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--memory-limit-mib", type=int, default=3500)
    parser.add_argument("--run-tag", default="", help="Optional unique suffix to preserve previous runs")
    parser.add_argument("--input", type=Path, default=SOURCE, help="Stereo 44100 Hz WAV inside samples, at most 30 seconds")
    args = parser.parse_args()
    if args.timeout <= 0 or args.memory_limit_mib <= 0:
        parser.error("Limits must be positive")
    if args.run_tag and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.run_tag):
        parser.error("Run tag must contain lowercase letters, digits and hyphens")
    SOURCE = args.input.resolve()
    if not SOURCE.is_relative_to((engine.ROOT / "samples").resolve()):
        parser.error("Input must stay inside samples")
    import soundfile as sf
    try:
        info = sf.info(SOURCE)
    except (OSError, RuntimeError) as exc:
        parser.error(f"Cannot read input WAV: {exc}")
    if info.format != "WAV" or info.samplerate != 44100 or info.channels != 2 or not 1 <= info.duration <= 30:
        parser.error("Expected stereo 44100 Hz WAV between 1 and 30 seconds")
    segment, overlap = PROFILES[args.profile]
    engine.MODEL = "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"
    engine.MODEL_KEY = "mel"
    engine.SOURCE = SOURCE
    engine.SAMPLE_ID = f"repair-hs-{args.profile}" + (f"-{args.run_tag}" if args.run_tag else "")
    engine.DEST = engine.ROOT / "results" / engine.SAMPLE_ID
    engine.CONFIG = {"segment_size": segment, "override_model_segment_size": True,
                     "batch_size": 1, "overlap": overlap, "pitch_shift": 0}
    if args.child:
        run_child()
        return 0
    return engine.supervise(args.timeout, args.memory_limit_mib,
                            [sys.executable, str(Path(__file__).resolve()), "--child", "--profile", args.profile,
                             "--run-tag", args.run_tag, "--input", str(SOURCE)])


if __name__ == "__main__":
    raise SystemExit(main())
