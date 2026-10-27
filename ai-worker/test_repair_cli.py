"""Protect experiment scope and paths without loading an AI model."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave

ROOT = Path(__file__).resolve().parents[1]


class RepairCliTests(unittest.TestCase):
    def reject(self, arguments, message):
        result = subprocess.run([sys.executable, str(ROOT / "ai-worker/repair_experiment.py"), *arguments],
                                cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn(message, result.stderr)

    def test_input_outside_samples(self):
        self.reject(["--input", str(ROOT / "README.md")], "Input must stay inside samples")

    def test_tag_cannot_change_path(self):
        self.reject(["--run-tag", "../outside"], "Run tag must contain")

    def test_audio_over_30_seconds_is_refused(self):
        sample_root = (ROOT / "samples").resolve()
        with tempfile.TemporaryDirectory(prefix="repair-cli-test-", dir=sample_root) as directory:
            fixture = Path(directory).resolve()
            self.assertTrue(fixture.is_relative_to(sample_root))
            audio = fixture / "too-long.wav"
            with wave.open(str(audio), "wb") as handle:
                handle.setnchannels(2)
                handle.setsampwidth(2)
                handle.setframerate(44100)
                handle.writeframes(bytes(31 * 44100 * 4))
            self.reject(["--input", str(audio)], "between 1 and 30 seconds")


if __name__ == "__main__":
    unittest.main()
