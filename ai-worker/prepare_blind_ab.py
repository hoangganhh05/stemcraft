"""Create offline, RMS-matched blind vocals for the two completed smoke runs."""
import csv
import hashlib
import json
from pathlib import Path
import random
import shutil

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "results/blind-ab-smoke"
SAMPLE_ID = "smoke-001"


def main():
    items = []
    input_hash = None
    for model in ("bs", "mel"):
        report_name = f"{model}-roformer-smoke.json" if SAMPLE_ID == "smoke-001" else f"{SAMPLE_ID}-{model}-roformer.json"
        report = json.loads((ROOT / "docs/reports" / report_name).read_text(encoding="utf-8"))
        if report["status"] != "COMPLETED":
            raise SystemExit(f"{model} has no completed run")
        if input_hash is not None and input_hash != report["input_sha256"]:
            raise SystemExit("Runs used different inputs")
        input_hash = report["input_sha256"]
        run = ROOT / report.get("result_dir", f"results/{model}-roformer-smoke-cpu-overlap1")
        metadata = json.loads((run / "output-metadata.json").read_text(encoding="utf-8"))
        vocal = next(item for item in metadata if "vocals" in item["file"].lower())
        source = run / "stems" / Path(vocal["file"]).name
        with source.open("rb") as handle:
            if hashlib.file_digest(handle, "sha256").hexdigest() != vocal["sha256"]:
                raise SystemExit("Vocal artifact changed after run validation")
        data, rate = sf.read(source, always_2d=True)
        rms = float(np.sqrt(np.mean(data ** 2)))
        peak = float(np.max(np.abs(data)))
        if rms <= 0 or not np.isfinite(data).all():
            raise SystemExit("Invalid or silent vocal")
        items.append(dict(model=model, source=str(source), data=data, rate=rate, rms=rms, peak=peak))
    if items[0]["rate"] != items[1]["rate"] or items[0]["data"].shape != items[1]["data"].shape:
        raise SystemExit("Sample rate / shape mismatch")
    if DEST.exists():
        raise SystemExit("Blind set already exists; refusing to overwrite mapping")
    target = min(min(item["rms"], 0.95 * item["rms"] / item["peak"]) for item in items)
    random.SystemRandom().shuffle(items)
    DEST.mkdir(parents=True)
    mapping = {}
    for label, item in zip(("A", "B"), items):
        gain = target / item["rms"]
        sf.write(DEST / f"vocals_{label}.wav", item["data"] * gain, item["rate"], subtype="PCM_24")
        mapping[label] = dict(model=item["model"], source=item["source"], linear_gain=gain,
                              source_rms=item["rms"], matched_rms=target)
    source_input = ROOT / report.get("input_path", "samples/shen-hello-viet-nam-030-055.wav")
    with source_input.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != input_hash:
            raise SystemExit("Input artifact changed")
    shutil.copyfile(source_input, DEST / "original.wav")
    (DEST / "mapping-private.json").write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    (DEST / "listen.m3u").write_text("#EXTM3U\noriginal.wav\nvocals_A.wav\nvocals_B.wav\n", encoding="utf-8")
    (DEST / "README.txt").write_text(
        "Listen to vocals_A.wav and vocals_B.wav at unchanged player volume.\n"
        "Use original.wav only for context. Do not open mapping-private.json until scoring.\n"
        "A/B vocals have equal RMS using attenuation only; this is not LUFS matching.\n"
        "No denoise, dynamic compression or resampling was applied. Original outputs remain intact.\n"
        "Score 1-5: naturalness, low bleed, low artifacts, preserved syllables, remix usability.\n"
        "One sample is insufficient to select a production model.\n", encoding="utf-8")
    with (DEST / "scores.csv").open("w", encoding="utf-8", newline="") as handle:
        fields = ["blind_id", "sample_id", "rater_id", "naturalness_1_5", "low_bleed_1_5",
                  "low_artifacts_1_5", "syllable_preservation_1_5", "remix_usability_1_5", "notes"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for label in ("A", "B"):
            writer.writerow(dict(blind_id=label, sample_id=SAMPLE_ID))
    print("Blind A/B files and empty score sheet ready; model mapping kept in results only.")


if __name__ == "__main__":
    import argparse
    import re
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample-id", default="smoke-001")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.sample_id):
        parser.error("Invalid sample ID")
    SAMPLE_ID = args.sample_id
    if SAMPLE_ID != "smoke-001":
        DEST = ROOT / f"results/blind-ab-{SAMPLE_ID}"
    main()
