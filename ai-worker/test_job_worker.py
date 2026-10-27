"""Resource supervision checks with sleeping subprocesses, never loads a model."""
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import psutil

from job_worker import ROOT, supervise


class WorkerSupervisionTests(unittest.TestCase):
    def check_guard(self, timeout, memory, expected):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            folder = Path(directory)
            args = SimpleNamespace(owner_pid=os.getpid(), max_duration=30,
                                   timeout=timeout, memory_mib=memory)
            with patch('psutil.virtual_memory', return_value=SimpleNamespace(available=1024 ** 3)):
                code = supervise(args, folder, [sys.executable, '-c', 'import time; time.sleep(30)'])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads((folder / 'progress.json').read_text())['error_code'], expected)
            self.assertNotEqual(json.loads((folder / 'runtime.json').read_text())['exit_code'], 0)

    def test_timeout_terminates_child(self):
        self.check_guard(0.1, 3500, 'TIMEOUT')

    def test_memory_guard_terminates_child(self):
        self.check_guard(30, 0.000001, 'MEMORY_LIMIT')

    def test_low_system_memory_terminates_child(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            folder = Path(directory)
            args = SimpleNamespace(owner_pid=os.getpid(), max_duration=30, timeout=10, memory_mib=3500)
            with patch('psutil.virtual_memory', return_value=SimpleNamespace(available=200 * 1024 ** 2)):
                code = supervise(args, folder, [sys.executable, '-c', 'import time; time.sleep(30)'])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads((folder / 'progress.json').read_text())['error_code'], 'MEMORY_LIMIT')

    def test_owner_exit_terminates_child(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            folder = Path(directory)
            args = SimpleNamespace(owner_pid=os.getpid(), max_duration=30, timeout=10, memory_mib=3500)
            with patch('psutil.Process.is_running', return_value=False):
                code = supervise(args, folder, [sys.executable, '-c', 'import time; time.sleep(30)'])
            self.assertEqual(code, 1)
            self.assertEqual(json.loads((folder / 'progress.json').read_text())['error_code'], 'WORKER_INTERRUPTED')

    def test_normal_exit_racing_process_sample_is_not_interruption(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            folder = Path(directory)
            args = SimpleNamespace(owner_pid=os.getpid(), max_duration=30, timeout=10, memory_mib=3500)

            def exited_during_sample(process, **_kwargs):
                process.wait(timeout=5)
                raise psutil.NoSuchProcess(process.pid)

            with patch('psutil.Process.children', autospec=True, side_effect=exited_during_sample):
                code = supervise(args, folder, [sys.executable, '-c', 'import time; time.sleep(0.1)'])
            self.assertEqual(code, 0)
            self.assertIsNone(json.loads((folder / 'runtime.json').read_text())['error_code'])


if __name__ == '__main__':
    unittest.main()
