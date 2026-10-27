"""Reject unsafe run identities and paths before loading any AI dependencies."""
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SmokeCliTests(unittest.TestCase):
    def reject(self, arguments, message):
        result = subprocess.run([sys.executable, str(ROOT / "ai-worker/smoke_test.py"), *arguments],
                                cwd=ROOT, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(message, result.stderr)

    def test_reject_path_traversal_in_sample_id(self):
        self.reject(["--sample-id", "../../outside"], "Sample ID")

    def test_reject_input_outside_samples(self):
        self.reject(["--input", str(ROOT / "README.md")], "Input must stay inside")

    def test_new_sample_requires_explicit_input(self):
        self.reject(["--sample-id", "smoke-999"], "New samples require")

    def test_negative_timeout_rejected(self):
        self.reject(["--timeout", "-1"], "must be positive")

    def test_legacy_requires_explicit_reproduction_flag(self):
        self.reject([], "reproduction-only")


if __name__ == "__main__":
    unittest.main()
