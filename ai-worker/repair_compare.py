"""Package before/after WAVs at equal RMS, with explicit waveform diagnostics."""
import argparse
import csv
import json
from pathlib import Path
import shutil
import re

import numpy as np
import soundfile as sf

from audit_seams import measures
from smoke_test import ROOT, sha256


def main(audit_only, run_tag="", long_sample=False):
    suffix = f"-{run_tag}" if run_tag else ""
    source_path = ROOT / ("samples/hoa-sua-justatee-045-070.wav" if long_sample else "samples/repair-hoa-sua-8s.wav")
    source, rate = sf.read(source_path, always_2d=True)
    old_run = ROOT / "results/smoke-002-mel-cpu-overlap1"
    old_metadata = json.loads((old_run / "output-metadata.json").read_text())
    old_entry = next(item for item in old_metadata if "vocals" in item["file"].lower())
    old_path = old_run / "stems" / old_entry["file"]
    if sha256(old_path) != old_entry["sha256"]:
        raise RuntimeError("Original baseline changed")
    old, old_rate = sf.read(old_path, always_2d=True)
    assert rate == old_rate == 44100
    if long_sample:
        old_report = json.loads((ROOT / "docs/reports/smoke-002-mel-roformer.json").read_text())
        assert old_report["input_sha256"] == sha256(source_path), "Baseline used a different input"
    signals = {"before_original": old if long_sample else old[194481:555660]}
    assert signals["before_original"].shape == source.shape
    raw_paths = {"before_original": str(old_path)}
    report = {"input_sha256": sha256(source_path), "profiles": {}}
    for profile in ("legacy", "context4s", "context8s"):
        run_report = ROOT / f"docs/reports/repair-hs-{profile}{suffix}-mel-roformer.json"
        if not run_report.exists():
            continue
        run = json.loads(run_report.read_text())
        if run["status"] != "COMPLETED":
            continue
        assert run["input_sha256"] == report["input_sha256"]
        folder = ROOT / run["result_dir"]
        meta = json.loads((folder / "output-metadata.json").read_text())
        entry = next(item for item in meta if "vocals" in item["file"].lower())
        path = folder / "stems" / entry["file"]
        assert sha256(path) == entry["sha256"]
        data, sr = sf.read(path, always_2d=True)
        assert sr == rate and data.shape == source.shape and np.isfinite(data).all()
        label = "before_reproduced" if profile == "legacy" else f"after_{profile}"
        signals[label] = data
        raw_paths[label] = str(path)
        report["profiles"][profile] = dict(seconds=run["elapsed_seconds"], peak_rss_mib=run["peak_rss_mib"],
                                             inference_config=run["inference_config"])
        audit = json.loads((folder / "chunk-audit.json").read_text())
        report["profiles"][profile].update(chunk_starts=audit["chunk_starts"],
                                             uncovered_frames=audit["uncovered_frames"])
    starts = list(range(27783, len(source), 27783))
    report["waveform_diagnostics"] = {"original": measures(source, rate, starts)}
    for label, data in signals.items():
        report["waveform_diagnostics"][label] = measures(data, rate, starts)
    report["new_grid_comparison"] = {}
    for profile, settings in report["profiles"].items():
        if profile == "legacy":
            continue
        boundaries = settings["chunk_starts"][1:]
        offset = 441 * (settings["inference_config"]["segment_size"]-1) // settings["inference_config"]["overlap"] // 2
        report["new_grid_comparison"][profile] = {
            "original": measures(source, rate, boundaries, offset),
            "before": measures(signals["before_original"], rate, boundaries, offset),
            "after": measures(signals[f"after_{profile}"], rate, boundaries, offset)}
    if "before_reproduced" in signals:
        x, y = signals["before_original"], signals["before_reproduced"]
        gain = float(np.sum(x*y)/np.sum(x*x))
        report["reproduction"] = dict(linear_gain=gain,
            normalized_dot=float(np.sum(x*y)/np.sqrt(np.sum(x*x)*np.sum(y*y))),
            residual_rms=float(np.sqrt(np.mean((y-gain*x)**2))))
    destination = ROOT / f"docs/reports/repair-comparison{suffix}.json"
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    for label, data in report["waveform_diagnostics"].items():
        print(label, "join_jump/local_RMS", round(data["median_join_jump_to_local_rms"], 6),
              "control_jump/local_RMS", round(data["median_midchunk_jump_to_local_rms"], 6))
    if audit_only:
        return
    if not any(label.startswith("after_") for label in signals):
        raise SystemExit("Need completed corrected run before publishing comparison")
    output = ROOT / f"results/repair-listening{suffix}"
    if output.exists():
        raise SystemExit("Comparison already exists; preserve it before creating another")
    rms = lambda data: float(np.sqrt(np.mean(data**2)))
    for data in signals.values():
        if not 0 < rms(data) or not np.isfinite(data).all():
            raise RuntimeError("Silent/nonfinite input")
    target = min(min(rms(data), .95*rms(data)/float(np.max(np.abs(data)))) for data in signals.values())
    output.mkdir(parents=True)
    shutil.copyfile(source_path, output / "01_original.wav")
    playlist = ["01_original.wav"]
    manifest = {}
    for index, (label, data) in enumerate(signals.items(), 2):
        filename = f"{index:02d}_{label}.wav"
        gain = target/rms(data)
        sf.write(output / filename, data*gain, rate, subtype="PCM_24")
        decoded, sr = sf.read(output / filename, always_2d=True)
        np.testing.assert_allclose(decoded, data*gain, atol=2**-23, rtol=0)
        assert abs(rms(decoded)-target) < 1e-7 and np.max(np.abs(decoded)) < 1
        manifest[filename] = dict(source=raw_paths[label], linear_gain=gain,
                                  rms=rms(decoded), frames=len(decoded), sample_rate=sr)
        playlist.append(filename)
    (output / "listen.m3u").write_text("#EXTM3U\n"+"\n".join(playlist)+"\n", encoding="utf-8")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    with (output / "ratings.csv").open("w", newline="", encoding="utf-8") as handle:
        fields = ["file", "lyric_clarity", "music_bleed", "distortion", "stutter", "notes"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for filename in manifest:
            writer.writerow({"file": filename})
    context = "45.00-70.00 seconds (25 s)" if long_sample else "49.41-57.60 seconds (8.19 s)"
    (output / "README.txt").write_text(
        f"All files cover Hoa sua source time {context}.\n"
        "01 is the original mix; vocal variants are RMS-matched using attenuation only.\n"
        "before_original is the archived result; after_context variants use longer context and real overlap.\n"
        "Keep player volume fixed; listen for intelligibility, consonants, sustained notes and periodic stutter.\n"
        "RMS matching is approximate perceived loudness, not LUFS matching. No gate or denoise was used.\n"
        "Fill ratings.csv. No automatic speech-quality scores or reference SDR are claimed.\n", encoding="utf-8")
    print("Before/after WAVs ready: equal RMS, attenuation only, originals preserved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audit-only", action="store_true")
    parser.add_argument("--run-tag", default="")
    parser.add_argument("--long-sample", action="store_true", help="Compare the full 25-second Hoa sua excerpt")
    args = parser.parse_args()
    if args.run_tag and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.run_tag):
        parser.error("Invalid run tag")
    main(args.audit_only, args.run_tag, args.long_sample)
