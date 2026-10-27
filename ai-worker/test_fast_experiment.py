"""Fast experiment safety and schedule tests; no weights or inference."""
import ast
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import fast_experiment as experiment


class FastExperimentTests(unittest.TestCase):
    def test_candidate_preserves_accepted_quality_profile(self):
        quality = json.loads((experiment.ROOT / 'config/ai-profile.json').read_text(encoding='utf-8'))
        before = deepcopy(quality)
        fast = experiment.candidate(quality)
        self.assertEqual(quality, before)
        self.assertEqual(quality['inference_config']['overlap'], 4)
        self.assertEqual(fast['inference_config']['overlap'], 2)
        self.assertEqual(fast['checkpoint_sha256'], quality['checkpoint_sha256'])
        self.assertEqual(fast['inference_config']['segment_size'], 801)
        self.assertFalse(fast['quality_accepted_by_user'])
        self.assertFalse(fast['public_release_ready'])

    def test_planned_calls_match_installed_library_schedule_at_boundaries(self):
        path = experiment.ROOT / '.venv/Lib/site-packages/audio_separator/separator/architectures/mdxc_separator.py'
        tree = ast.parse(path.read_text(encoding='utf-8'))
        method = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == '_roformer_chunk_starts')
        method.decorator_list = []
        namespace = {}
        # Execute only this trusted installed method; no torch/model imports.
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(path), 'exec'), namespace)
        schedule = namespace['_roformer_chunk_starts']
        chunk = 441 * 800
        for frames in [1, chunk - 1, chunk, chunk + 1, 44100 * 16, 44100 * 25, 44100 * 30]:
            for overlap in [2, 4]:
                self.assertEqual(experiment.call_count(frames, 801, overlap), len(schedule(frames, chunk, chunk // overlap)))
        self.assertEqual(experiment.call_count(44100 * 25, 801, 4), 10)
        self.assertEqual(experiment.call_count(44100 * 25, 801, 2), 6)

    def test_low_memory_blocks_without_starting_worker(self):
        with tempfile.TemporaryDirectory(dir=experiment.ROOT / '.cache') as directory:
            report_path = Path(directory) / 'report.json'
            with patch.object(sys, 'argv', ['fast_experiment.py', '--run']), patch.object(experiment, 'REPORT', report_path), patch.object(experiment, 'plan', return_value={'status': 'PLANNED'}), patch('psutil.virtual_memory', return_value=SimpleNamespace(available=512 * 1024 ** 2)), patch.object(experiment, 'supervise') as worker:
                self.assertEqual(experiment.main(), 2)
                worker.assert_not_called()
            self.assertEqual(json.loads(report_path.read_text())['status'], 'BLOCKED')


if __name__ == '__main__':
    unittest.main()
