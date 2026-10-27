"""Verify a fresh venv against the lockfile without downloading or loading models."""
import importlib.metadata as metadata
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    import numpy as np
    import soundfile as sf
    import torch
    from audio_separator.separator import Separator

    prefix = Path(sys.prefix).resolve()
    if prefix == Path(sys.base_prefix).resolve():
        raise RuntimeError("Run this check inside a virtual environment")
    packages = {}
    for line in (ROOT / "ai-worker/requirements.lock.txt").read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, expected = line.split("==")
        actual = metadata.version(name)
        if actual != expected:
            raise RuntimeError(f"Version mismatch: {name}: {actual} != {expected}")
        location = Path(metadata.distribution(name).locate_file("")).resolve()
        if not location.is_relative_to(prefix):
            raise RuntimeError(f"Dependency leaked from another environment: {name}")
        packages[name] = actual
    torch.set_num_threads(2)
    assert torch.isfinite(torch.ones(2, 2) @ torch.ones(2, 2)).all()
    signal = np.zeros((4410, 2), dtype=np.float32)
    with tempfile.TemporaryDirectory(dir=ROOT / ".cache") as directory:
        path = Path(directory) / "io-check.wav"
        sf.write(path, signal, 44100, subtype="PCM_16")
        decoded, rate = sf.read(path, dtype="float32", always_2d=True)
        assert rate == 44100 and np.array_equal(decoded, signal)
    report = {
        "status": "PASS", "python": sys.version,
        "environment": str(prefix), "base_python": sys.base_prefix,
        "packages_verified": len(packages), "packages": packages,
        "torch_runtime": torch.__version__, "cuda_available": torch.cuda.is_available(),
        "separator_import": Separator.__name__, "wav_roundtrip": "PASS",
        "models_loaded": False,
        "scope": "Fresh isolated venv on existing Windows host; cached package artifacts",
    }
    output = ROOT / "docs/reports/epic-01-clean-python.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "packages"}, indent=2))


if __name__ == "__main__":
    main()
