param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

Write-Host "Rusty CAN Studio Windows setup"
Write-Host "Checking required tools..."

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Missing: $Name"
    Write-Host $InstallHint
    exit 1
  }
}

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "cargo" "Install Rust from https://rustup.rs/"

Write-Host "Node:  $(node --version)"
Write-Host "npm:   $(npm --version)"
Write-Host "Cargo: $(cargo --version)"

if (-not $SkipInstall) {
  Write-Host ""
  Write-Host "Installing npm dependencies..."
  npm install
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Run the app with:"
Write-Host "  npm run tauri dev"
Write-Host ""
Write-Host "Build a Windows MSI with:"
Write-Host "  npm run tauri build -- --bundles msi"
