param(
    [string]$CertName = "ClipDesk Code Signing",
    [string]$Password = $env:CLIPDESK_CERT_PASSWORD,
    [string]$OutputDir = "certs",
    [string]$PfxFile = "clipdesk-codesign.pfx"
)

$ErrorActionPreference = "Stop"

# The certificate password comes from -Password or CLIPDESK_CERT_PASSWORD; it is never stored in the repo
if ([string]::IsNullOrEmpty($Password)) {
    throw "Set CLIPDESK_CERT_PASSWORD (or pass -Password) to the code signing certificate password."
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$pfxPath = Join-Path $OutputDir $PfxFile

Write-Host "Creating Self-Signed Code Signing Certificate for $CertName..." -ForegroundColor Cyan

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=$CertName" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(5)

$securePass = ConvertTo-SecureString -String $Password -Force -AsPlainText

Export-PfxCertificate `
    -Cert $cert `
    -FilePath $pfxPath `
    -Password $securePass | Out-Null

Write-Host "Exported Certificate PFX to: $pfxPath" -ForegroundColor Green
Write-Host "To sign builds with electron-builder, set:" -ForegroundColor Yellow
Write-Host "`$env:CSC_LINK = '$pfxPath'"
Write-Host "`$env:CSC_KEY_PASSWORD = '$Password'"
