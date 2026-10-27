"""Check lossless resume and reject changed/corrupted chunk artifacts."""
from pathlib import Path
import tempfile
import unittest

import numpy as np

from full_track import ROOT, save_cache, load_cache


class CacheTests(unittest.TestCase):
    def test_actual_stereo_output_without_stem_axis(self):
        cache_root = (ROOT / ".cache").resolve()
        with tempfile.TemporaryDirectory(prefix="full-cache-test-", dir=cache_root) as directory:
            folder = Path(directory).resolve()
            self.assertTrue(folder.is_relative_to(cache_root))
            data = np.random.default_rng(7).normal(size=(2, 352800)).astype("float32")
            save_cache(folder, 0, "actual-stereo", data, 1)
            loaded, _ = load_cache(folder, 0, "actual-stereo")
            np.testing.assert_array_equal(loaded, data)

    def test_roundtrip_and_corruption(self):
        cache_root = (ROOT / ".cache").resolve()
        cache_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="full-cache-test-", dir=cache_root) as directory:
            folder = Path(directory).resolve()
            self.assertTrue(folder.is_relative_to(cache_root))
            data = np.random.default_rng(17).normal(size=(1, 2, 64)).astype("float32")
            self.assertIsNone(load_cache(folder, 0, "input-a"))
            record = save_cache(folder, 0, "input-a", data, 2.5)
            loaded, observed = load_cache(folder, 0, "input-a")
            np.testing.assert_array_equal(loaded, data)
            self.assertEqual(observed, record)
            with self.assertRaisesRegex(RuntimeError, "mismatch"):
                load_cache(folder, 0, "different-input")
            with (folder / "0000.npy").open("ab") as handle:
                handle.write(b"corrupted")
            with self.assertRaisesRegex(RuntimeError, "mismatch"):
                load_cache(folder, 0, "input-a")

    def test_nonfinite_prediction_refused(self):
        data = np.full((1, 2, 64), np.nan, dtype="float32")
        with self.assertRaisesRegex(RuntimeError, "Invalid model result"):
            save_cache(ROOT / ".cache", 0, "input", data, 0)


if __name__ == "__main__":
    unittest.main()
