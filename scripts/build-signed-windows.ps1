param(
    [string]$Password = "ClipDesk2026!",
    [switch]$Msi = $false
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$certPath = Join-Path (Split-Path -Parent $scriptDir) "certs/clipdesk-codesign.pfx"

if (-not (Test-Path $certPath)) {
    Write-Host "No code signing certificate found. Generating local test certificate..." -ForegroundColor Yellow
    & "$scriptDir/create-code-signing-cert.ps1" -Password $Password
}

$env:CSC_LINK = (Resolve-Path $certPath).Path
$env:CSC_KEY_PASSWORD = $Password

Write-Host "CSC_LINK set to: $env:CSC_LINK" -ForegroundColor Cyan
Write-Host "Building Windows packages with code signing enabled..." -ForegroundColor Cyan

npm run build:desktop

if ($Msi) {
    Write-Host "Building NSIS and MSI installers..." -ForegroundColor Cyan
    npx electron-builder --win nsis msi
} else {
    Write-Host "Building NSIS installer (.exe)..." -ForegroundColor Cyan
    npx electron-builder --win nsis
}
