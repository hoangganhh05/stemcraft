"""Read-only dependency diagnostic; never downloads checkpoints or runs inference."""
import importlib.util
import json
import platform
import shutil


def main():
    report = {
        "python": platform.python_version(),
        "ffmpeg": shutil.which("ffmpeg"),
        "ffprobe": shutil.which("ffprobe"),
        "torch_installed": importlib.util.find_spec("torch") is not None,
        "audio_separator_installed": importlib.util.find_spec("audio_separator") is not None,
    }
    if report["torch_installed"]:
        try:
            import torch
            report.update(torch_version=torch.__version__, cuda_available=torch.cuda.is_available())
            if torch.cuda.is_available():
                report["gpu"] = torch.cuda.get_device_name(0)
                report["vram_bytes"] = torch.cuda.get_device_properties(0).total_memory
        except Exception as exc:
            report["torch_error"] = str(exc)
    print(json.dumps(report, indent=2))
    return 0 if all((report["ffmpeg"], report["ffprobe"], report["torch_installed"], report["audio_separator_installed"])) and "torch_error" not in report else 1


if __name__ == "__main__":
    raise SystemExit(main())
