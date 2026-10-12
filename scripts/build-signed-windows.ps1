param(
    [string]$Password = $env:CLIPDESK_CERT_PASSWORD,
    [switch]$Msi = $false,
    # Upload the installer and latest.yml to a GitHub release (needs GH_TOKEN) so installed copies auto-update
    [switch]$Publish = $false
)

$ErrorActionPreference = "Stop"

# The certificate password comes from -Password or CLIPDESK_CERT_PASSWORD; it is never stored in the repo
if ([string]::IsNullOrEmpty($Password)) {
    throw "Set CLIPDESK_CERT_PASSWORD (or pass -Password) to the code signing certificate password."
}

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

$publishMode = if ($Publish) { "always" } else { "never" }
if ($Publish -and [string]::IsNullOrEmpty($env:GH_TOKEN)) {
    throw "Set GH_TOKEN to a GitHub token with repo access to publish a release."
}

if ($Msi) {
    Write-Host "Building NSIS and MSI installers..." -ForegroundColor Cyan
    npx electron-builder --win nsis msi --publish $publishMode
} else {
    Write-Host "Building NSIS installer (.exe)..." -ForegroundColor Cyan
    npx electron-builder --win nsis --publish $publishMode
}
