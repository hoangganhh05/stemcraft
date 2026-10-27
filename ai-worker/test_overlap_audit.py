"""Exercise installed scheduler and overlap-add arithmetic without loading model dependencies."""
import ast
from pathlib import Path
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / ".venv/Lib/site-packages/audio_separator/separator/architectures/mdxc_separator.py"


def installed_function(name):
    tree = ast.parse(LIBRARY.read_text(encoding="utf-8"))
    node = next(item for item in ast.walk(tree) if isinstance(item, ast.FunctionDef) and item.name == name)
    node.decorator_list = []
    namespace = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(LIBRARY), "exec"), namespace)
    return namespace[name]


class OverlapTests(unittest.TestCase):
    def test_identity_roundtrip_and_tail_coverage(self):
        schedule = installed_function("_roformer_chunk_starts")
        add = installed_function("overlap_add")
        for segment, overlap in ((64, 1), (401, 2), (801, 4)):
            chunk = 441 * (segment - 1)
            for length in (chunk - 1, chunk, chunk + 17, chunk * 2 + 123):
                with self.subTest(segment=segment, overlap=overlap, length=length):
                    source = np.random.default_rng(42).normal(0, .1, (2, length)).astype("float32")
                    result = np.zeros_like(source)
                    counter = np.zeros_like(source)
                    window = np.hamming(chunk).astype("float32")
                    starts = schedule(length, chunk, chunk // overlap)
                    self.assertEqual(starts, sorted(set(starts)))
                    for start in starts:
                        part = source[:, start:start+chunk]
                        result = add(None, result, part, window, start, part.shape[-1])
                        counter[:, start:start+part.shape[-1]] += window[:part.shape[-1]]
                    self.assertTrue(np.all(counter > 0))
                    np.testing.assert_allclose(result/counter, source, atol=1e-7, rtol=1e-6)


if __name__ == "__main__":
    unittest.main()
