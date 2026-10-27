"""Bounded local-only CPU experiment; does not approve a model for deployment."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
MODEL_KEY = "bs"
SAMPLE_ID = "smoke-001"
SOURCE = ROOT / "samples/shen-hello-viet-nam-030-055.wav"
DEST = ROOT / "results/bs-roformer-smoke-cpu-overlap1"
CONFIG = {"segment_size": 64, "override_model_segment_size": True,
          "batch_size": 1, "overlap": 1, "pitch_shift": 0}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def child():
    import torch
    from audio_separator.separator import Separator
    import numpy as np
    import soundfile as sf

    torch.set_num_threads(2)
    separator = Separator(model_file_dir=str(ROOT / "models"), output_dir=str(DEST / "partial"),
                          output_format="WAV", use_soundfile=True, mdxc_params=CONFIG,
                          normalization_threshold=0.9)
    separator.load_model(model_filename=MODEL)
    outputs = separator.separate(str(SOURCE))
    metadata = []
    for output in outputs:
        path = DEST / "partial" / output
        if not path.is_file():
            raise RuntimeError(f"Missing output: {output}")
        data, sample_rate = sf.read(path, always_2d=True)
        if data.size == 0 or not np.isfinite(data).all():
            raise RuntimeError("Empty or nonfinite audio")
        duration = len(data) / sample_rate
        expected = sf.info(SOURCE)
        if abs(len(data) - expected.frames) > 1 or sample_rate != expected.samplerate or data.shape[1] != 2:
            raise RuntimeError("Output duration or channels mismatch")
        peak = float(np.max(np.abs(data)))
        if peak >= 1:
            raise RuntimeError("Clipped output")
        metadata.append(dict(file=output, duration_seconds=duration, sample_rate=sample_rate,
                             channels=data.shape[1], peak=peak, sha256=sha256(path)))
    if len(metadata) != 2:
        raise RuntimeError("Expected two stems")
    (DEST / "output-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def supervise(timeout, memory_limit_mib, child_command=None, resume=False):
    import psutil
    checkpoint = ROOT / "models" / MODEL
    if not checkpoint.is_file() or not SOURCE.is_file():
        raise SystemExit("Checkpoint and sample must exist before starting; no automatic checkpoint download.")
    if DEST.exists() and not resume:
        raise SystemExit("Result directory already exists; preserve prior runs before retrying.")
    DEST.mkdir(parents=True, exist_ok=resume)
    (DEST / "partial").mkdir(exist_ok=resume)
    report = dict(status="STARTING", model=MODEL, sample_id=SAMPLE_ID,
                  input_path=str(SOURCE.relative_to(ROOT)), result_dir=str(DEST.relative_to(ROOT)),
                  model_id="mel-band-roformer-vocal" if MODEL_KEY == "mel" else "bs-roformer-viperx-1297",
                  checkpoint_sha256=sha256(checkpoint),
                  input_sha256=sha256(SOURCE), inference_config=CONFIG,
                  inference_config_sha256=hashlib.sha256(json.dumps(CONFIG, sort_keys=True).encode()).hexdigest(),
                  config_sha256=sha256(checkpoint.with_suffix(".yaml")),
                  timeout_seconds=timeout, rss_limit_mib=memory_limit_mib,
                  license_status="unverified_local_experiment_only", peak_rss_mib=0)
    report_name = f"{MODEL_KEY}-roformer-smoke.json" if SAMPLE_ID == "smoke-001" else f"{SAMPLE_ID}-{MODEL_KEY}-roformer.json"
    report_path = ROOT / "docs/reports" / report_name
    started = time.monotonic()
    env = dict(os.environ, CUDA_VISIBLE_DEVICES="", OMP_NUM_THREADS="2", MKL_NUM_THREADS="2")
    with (DEST / "inference.log").open("w", encoding="utf-8") as log:
        command = child_command or [sys.executable, str(Path(__file__).resolve()), "--child", "--model", MODEL_KEY,
                                    "--sample-id", SAMPLE_ID, "--input", str(SOURCE)]
        process = subprocess.Popen(command,
                                   cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        monitor = psutil.Process(process.pid)
        def stop_tree():
            try:
                descendants = monitor.children(recursive=True)
            except psutil.NoSuchProcess:
                descendants = []
            for descendant in reversed(descendants):
                try:
                    descendant.kill()
                except psutil.NoSuchProcess:
                    pass
            if process.poll() is None:
                process.kill()
        report["status"] = "PROCESSING"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        try:
            while process.poll() is None:
                rss = 0
                try:
                    processes = [monitor, *monitor.children(recursive=True)]
                except psutil.NoSuchProcess:
                    processes = []
                for item in processes:
                    try:
                        rss += item.memory_info().rss / 1024 ** 2
                    except psutil.NoSuchProcess:
                        continue
                report["peak_rss_mib"] = max(report["peak_rss_mib"], rss)
                report["elapsed_seconds"] = time.monotonic() - started
                if int(report["elapsed_seconds"]) % 5 == 0:
                    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
                if time.monotonic() - started > timeout:
                    report["error_code"] = "TIMEOUT"
                    stop_tree()
                    break
                if rss > memory_limit_mib or psutil.virtual_memory().available < 256 * 1024 ** 2:
                    report["error_code"] = "MEMORY_LIMIT"
                    stop_tree()
                    break
                time.sleep(0.5)
            process.wait()
        finally:
            if process.poll() is None:
                stop_tree()
                process.wait()
            report.update(exit_code=process.returncode, elapsed_seconds=time.monotonic() - started)
            report["status"] = "COMPLETED" if process.returncode == 0 and "error_code" not in report else "FAILED"
            if report["status"] == "COMPLETED":
                (DEST / "partial").rename(DEST / "stems")
            report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "COMPLETED" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--model", choices=["bs", "mel"], default="bs")
    parser.add_argument("--sample-id", default="smoke-001")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--memory-limit-mib", type=int, default=3500)
    parser.add_argument("--allow-legacy", action="store_true", help="Explicitly reproduce the old 0.63-second non-overlapped experiment")
    args = parser.parse_args()
    if args.timeout <= 0 or args.memory_limit_mib <= 0:
        parser.error("Timeout and memory limit must be positive")
    import re
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.sample_id):
        parser.error("Sample ID must contain lowercase letters, digits and hyphens")
    SAMPLE_ID = args.sample_id
    if args.input:
        SOURCE = args.input.resolve()
        if not SOURCE.is_relative_to((ROOT / "samples").resolve()):
            parser.error("Input must stay inside samples directory")
    elif SAMPLE_ID != "smoke-001":
        parser.error("New samples require --input")
    MODEL_KEY = args.model
    if args.model == "mel":
        MODEL = "model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt"
        DEST = ROOT / "results/mel-roformer-smoke-cpu-overlap1"
    if SAMPLE_ID != "smoke-001":
        DEST = ROOT / f"results/{SAMPLE_ID}-{MODEL_KEY}-cpu-overlap1"
    if not args.child and not args.allow_legacy:
        parser.error("Legacy short-chunk pipeline is reproduction-only. Use repair_experiment.py; --allow-legacy explicitly reproduces old behavior.")
    if args.child:
        child()
    else:
        raise SystemExit(supervise(args.timeout, args.memory_limit_mib))
