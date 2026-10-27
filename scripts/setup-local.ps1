# Prerequisites: Node/npm, uv, Python 3.11 x64, MySQL, FFmpeg/FFprobe.
# Never downloads model weights or overwrites an existing .env.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    function Invoke-Checked {
        param([string]$Program, [string[]]$Arguments)
        & $Program @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$Program failed; setup stopped." }
    }
    Invoke-Checked 'npm.cmd' @('ci')
    Invoke-Checked 'npm.cmd' @('run', 'db:generate')
    if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
        Invoke-Checked 'uv' @('venv', '.venv', '--python', '3.11')
    }
    Invoke-Checked 'uv' @('pip', 'sync', 'ai-worker/requirements.lock.txt', '--python', '.venv/Scripts/python.exe')
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
    }
    Write-Host 'Dependencies prepared. Configure .env locally, then run npm.cmd run db:init and npm.cmd run db:migrate.'
    Write-Host 'Provide verified model files separately. Run npm.cmd run doctor before npm.cmd run dev.'
} finally {
    Pop-Location
}
