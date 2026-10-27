"""Measure waveform joins; these diagnostics are not separation quality metrics."""
import json
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]


def measures(data, rate, starts, control_offset=27783//2):
    delta = np.max(np.abs(np.diff(data, axis=0)), axis=1)
    rms = lambda x: float(np.sqrt(np.mean(x*x)))
    width = round(rate * 0.01)
    rows = []
    for index in starts:
        if index < 5*width or index + 5*width >= len(data):
            continue
        local = data[index-5*width:index+5*width]
        around = data[index-width:index+width]
        rows.append(dict(time_seconds=index/rate, jump=float(np.max(np.abs(data[index]-data[index-1]))),
                         edge_rms=rms(around), neighborhood_rms=rms(local),
                         edge_to_neighborhood_rms=rms(around)/max(rms(local), 1e-12)))
    boundaries = set(starts)
    controls = [index + control_offset for index in starts
                if index + control_offset < len(data) and index + control_offset not in boundaries]
    normalized = lambda index: float(np.max(np.abs(data[index]-data[index-1]))) / max(rms(data[index-width:index+width]), 1e-12)
    joins_normalized = [normalized(index) for index in starts if width < index < len(data)-width]
    controls_normalized = [normalized(index) for index in controls if width < index < len(data)-width]
    return dict(frames=len(data), sample_rate=rate, channels=data.shape[1],
                peak=float(np.max(np.abs(data))), finite=bool(np.isfinite(data).all()),
                delta_p99=float(np.quantile(delta, .99)), joins=rows,
                median_join_jump_to_local_rms=float(np.median(joins_normalized)),
                median_midchunk_jump_to_local_rms=float(np.median(controls_normalized)))


def main():
    original, rate = sf.read(ROOT / "samples/hoa-sua-justatee-045-070.wav", always_2d=True)
    report = {}
    starts = list(range(27783, len(original), 27783))
    report["original"] = measures(original, rate, starts)
    for model in ("bs", "mel"):
        run = ROOT / f"results/smoke-002-{model}-cpu-overlap1"
        path = next((run / "stems").glob("*(Vocals)*"))
        data, sr = sf.read(path, always_2d=True)
        report[model] = measures(data, sr, starts)
    output = ROOT / "docs/reports/repair-initial-seams.json"
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    for key, value in report.items():
        jumps = [row["jump"] for row in value["joins"]]
        ratios = [row["edge_to_neighborhood_rms"] for row in value["joins"]]
        print(key, "median_join_jump", float(np.median(jumps)), "p99_delta", value["delta_p99"],
              "median_edge_rms_ratio", float(np.median(ratios)))


if __name__ == "__main__":
    main()
