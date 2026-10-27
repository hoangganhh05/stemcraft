import csv
import hashlib
from pathlib import Path
import tempfile
import unittest

from validate_samples import validate


class InventoryTests(unittest.TestCase):
    def test_validation_boundaries(self):
        cache = Path(__file__).resolve().parents[1] / ".cache"
        cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            root = Path(directory)
            audio = root / "sample.wav"
            audio.write_bytes(b"test fixture, not decoded audio")
            row = dict(sample_id="s1", relative_path=audio.name, rights_basis="owned",
                       genre="ballad", vocal_type="female", features="reverb",
                       start_seconds="0", duration_seconds="25",
                       sha256=hashlib.sha256(audio.read_bytes()).hexdigest())
            inventory = root / "inventory.csv"

            def check():
                with inventory.open("w", newline="", encoding="utf-8") as handle:
                    writer = csv.DictWriter(handle, fieldnames=row.keys())
                    writer.writeheader()
                    writer.writerow(row)
                return validate(inventory, root, minimum=1)

            self.assertEqual(check(), [])
            row["relative_path"] = "../outside.wav"
            self.assertTrue(any("path must stay" in item for item in check()))
            row["relative_path"] = audio.name
            row["sha256"] = "0" * 64
            self.assertTrue(any("SHA-256" in item for item in check()))
            row["duration_seconds"] = "nan"
            self.assertTrue(any("duration" in item for item in check()))
            row["rights_basis"] = ""
            self.assertTrue(any("rights_basis" in item for item in check()))


if __name__ == "__main__":
    unittest.main()
