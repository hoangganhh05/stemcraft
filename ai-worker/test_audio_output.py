"""Export validation uses synthetic audio, never loads weights or judges quality."""
from pathlib import Path
import tempfile
import unittest
import numpy as np
import soundfile as sf
from job_worker import ROOT, validate_output


class OutputValidationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / '.cache')
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'output.wav'
        self.frames = 4410
        self.audio = np.column_stack([np.sin(np.arange(self.frames) * 0.1) * 0.4] * 2)

    def write(self, audio=None, rate=44100, subtype='FLOAT', format='WAV'):
        sf.write(self.path, self.audio if audio is None else audio, rate, subtype=subtype, format=format)

    def test_valid_pcm_metadata(self):
        self.write(subtype='PCM_16')
        metadata = validate_output(self.path, self.frames)
        self.assertEqual(metadata['frames'], self.frames)
        self.assertEqual(metadata['channels'], 2)
        self.assertEqual(metadata['sample_rate'], 44100)
        self.assertAlmostEqual(metadata['peak'], 0.4, places=3)
        self.assertEqual(len(metadata['sha256']), 64)

    def test_reject_wrong_duration_rate_channels_or_container(self):
        for audio, rate, format in [(self.audio[:-1], 44100, 'WAV'), (self.audio, 48000, 'WAV'), (self.audio[:, 0], 44100, 'WAV'), (self.audio, 44100, 'AIFF')]:
            with self.subTest(rate=rate, shape=audio.shape, format=format):
                self.write(audio, rate, format=format)
                with self.assertRaises(RuntimeError):
                    validate_output(self.path, self.frames)

    def test_reject_silence_clipping_nan_and_infinity(self):
        for value in [0, 1, -1, 1.2, float('nan'), float('inf')]:
            with self.subTest(value=value):
                self.write(np.full((self.frames, 2), value, dtype=np.float32))
                with self.assertRaises(RuntimeError):
                    validate_output(self.path, self.frames)

    def test_reject_empty_and_corrupt_file(self):
        for content in [b'', b'not a WAV']:
            self.path.write_bytes(content)
            with self.assertRaises((RuntimeError, sf.LibsndfileError)):
                validate_output(self.path, self.frames)


if __name__ == '__main__':
    unittest.main()
