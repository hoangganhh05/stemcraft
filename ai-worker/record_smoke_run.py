"""Record observed runs without treating a smoke test as quality approval."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "docs/benchmark/runs.csv"
FIELDS = INVENTORY.read_text(encoding="utf-8").splitlines()[0].split(",")


def main():
    existing = list(csv.DictReader(INVENTORY.open(encoding="utf-8", newline="")))
    ids = {row["run_id"] for row in existing}
    runs = [
        ("bs-roformer-smoke-overlap2.json", "smoke-bs1297-overlap2-stopped", "bs-roformer-smoke"),
        ("bs-roformer-smoke.json", "smoke-bs1297-overlap1", "bs-roformer-smoke-cpu-overlap1"),
        ("mel-roformer-smoke.json", "smoke-mel1143-overlap1", "mel-roformer-smoke-cpu-overlap1"),
    ]
    for report_path in sorted((ROOT / "docs/reports").glob("smoke-*-*-roformer.json")):
        report = json.loads(report_path.read_text(encoding="utf-8-sig"))
        model = "mel" if report["model_id"] == "mel-band-roformer-vocal" else "bs"
        runs.append((report_path.name, f"{report['sample_id']}-{model}-overlap1", Path(report["result_dir"]).name))
    for name, run_id, directory in runs:
        path = ROOT / "docs/reports" / name
        if not path.exists():
            continue
        report = json.loads(path.read_text(encoding="utf-8-sig"))
        if report["status"] not in ("COMPLETED", "FAILED"):
            raise SystemExit("Run is not finished; refusing to record an incomplete result")
        if run_id in ids:
            continue
        row = dict.fromkeys(FIELDS, "")
        row.update(run_id=run_id, sample_id=report.get("sample_id", "smoke-001"),
                   model_id=report.get("model_id", "mel-band-roformer-vocal" if name.startswith("mel-") else "bs-roformer-viperx-1297"),
                   checkpoint_sha256=report["checkpoint_sha256"],
                   config_sha256=report["inference_config_sha256"],
                   hardware="i5-6440HQ CPU FP32 2 threads 7.9GiB RAM",
                   elapsed_seconds=round(report["elapsed_seconds"], 2), status=report["status"],
                   error_code=report.get("error_code", ""))
        if report.get("memory_measurement_valid", True):
            row["peak_ram_mib"] = round(report["peak_rss_mib"], 2)
        if report["status"] == "COMPLETED":
            metadata = json.loads((ROOT / "results" / directory / "output-metadata.json").read_text(encoding="utf-8"))
            for item in metadata:
                stem = "output_instrumental_path" if "instrumental" in item["file"].lower() else "output_vocal_path"
                row[stem.replace("output_", "")] = f"results/{directory}/stems/{Path(item['file']).name}"
        existing.append(row)
    with INVENTORY.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(existing)
    print("Smoke run records saved; listening scores remain unreviewed.")


if __name__ == "__main__":
    main()
