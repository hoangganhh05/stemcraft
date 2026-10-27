"""Validate benchmark inventory without uploading or changing user audio."""
import argparse
import csv
import hashlib
from pathlib import Path


def validate(inventory, sample_root, minimum=20):
    errors = []
    root = sample_root.resolve()
    with inventory.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) < minimum:
        errors.append(f"Need at least {minimum} samples; found {len(rows)}")
    identifiers, hashes = set(), set()
    for number, row in enumerate(rows, 2):
        prefix = f"line {number}: "
        identifier = row.get("sample_id", "").strip()
        if not identifier or identifier in identifiers:
            errors.append(prefix + "missing or duplicate sample_id")
        identifiers.add(identifier)
        for field in ("rights_basis", "genre", "vocal_type", "features"):
            if not row.get(field, "").strip():
                errors.append(prefix + f"missing {field}")
        try:
            duration = float(row["duration_seconds"])
            start = float(row["start_seconds"])
            if not (20 <= duration <= 30 and 0 <= start < float("inf")):
                raise ValueError()
        except (KeyError, ValueError):
            errors.append(prefix + "duration must be 20–30 seconds and start must be finite/nonnegative")
        relative = row.get("relative_path", "").strip()
        source = (root / relative).resolve()
        if not relative or Path(relative).is_absolute() or not source.is_relative_to(root):
            errors.append(prefix + "path must stay within samples directory")
            continue
        if not source.is_file():
            errors.append(prefix + "audio file missing")
            continue
        digest = hashlib.sha256()
        with source.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        actual = digest.hexdigest()
        if row.get("sha256", "").lower() != actual:
            errors.append(prefix + "SHA-256 mismatch")
        if actual in hashes:
            errors.append(prefix + "duplicate audio content; use distinct pre-cut files")
        hashes.add(actual)
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=Path("docs/benchmark/samples.csv"))
    parser.add_argument("--samples", type=Path, default=Path("samples"))
    args = parser.parse_args()
    problems = validate(args.inventory, args.samples)
    print("\n".join(problems) if problems else "Inventory valid; audio metadata/quality still require FFprobe and listening checks.")
    raise SystemExit(bool(problems))
