"""Verify blind audio without printing the private model mapping."""
import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "results/blind-ab-smoke"
SAMPLE_ID = "smoke-001"


def main():
    mapping = json.loads((DEST / "mapping-private.json").read_text(encoding="utf-8"))
    levels = []
    for label, item in mapping.items():
        data, rate = sf.read(DEST / f"vocals_{label}.wav", always_2d=True)
        source, source_rate = sf.read(item["source"], always_2d=True)
        np.testing.assert_allclose(data, source * item["linear_gain"], atol=2 ** -23, rtol=0)
        assert rate == source_rate == 44100
        assert data.shape == (1102500, 2)
        assert np.isfinite(data).all() and np.max(np.abs(data)) < 1
        levels.append(float(np.sqrt(np.mean(data ** 2))))
        model = item["model"]
        report_name = f"{model}-roformer-smoke.json" if SAMPLE_ID == "smoke-001" else f"{SAMPLE_ID}-{model}-roformer.json"
        report = json.loads((ROOT / "docs/reports" / report_name).read_text(encoding="utf-8"))
        run = ROOT / report.get("result_dir", f"results/{model}-roformer-smoke-cpu-overlap1")
        metadata = json.loads((run / "output-metadata.json").read_text())
        expected = next(entry["sha256"] for entry in metadata if "vocals" in entry["file"].lower())
        assert hashlib.sha256(Path(item["source"]).read_bytes()).hexdigest() == expected
    assert len(levels) == 2 and abs(levels[0] - levels[1]) < 1e-7
    assert hashlib.sha256((DEST / "original.wav").read_bytes()).digest() == hashlib.sha256(
        (ROOT / report.get("input_path", "samples/shen-hello-viet-nam-030-055.wav")).read_bytes()).digest()
    print("A/B verification PASS: gain only, matched RMS, valid audio, raw outputs unchanged.")


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
