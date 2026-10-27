# Dot-source: . .\scripts\activate-local.ps1
$projectRoot = Split-Path -Parent $PSScriptRoot
$venvBin = Join-Path $projectRoot '.venv\Scripts'
$ffmpegRoot = Join-Path $projectRoot '.tools\ffmpeg'
$env:PATH = "$venvBin;$env:PATH"
if (Test-Path -LiteralPath $ffmpegRoot) {
    $ffmpegBinary = Get-ChildItem -LiteralPath $ffmpegRoot -Filter ffmpeg.exe -Recurse | Select-Object -First 1
    if ($ffmpegBinary) { $env:PATH = "$($ffmpegBinary.DirectoryName);$env:PATH" }
}
Write-Host 'Project Python/FFmpeg added to this PowerShell session only.'
