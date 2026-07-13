param(
  [switch]$SkipRust,
  [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "== $Name =="
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

Invoke-Step "TypeScript unit tests" {
  npm run test
}

Invoke-Step "Production build" {
  npm run build
}

if (-not $SkipAudit) {
  Invoke-Step "npm dependency audit" {
    npm run audit
  }
}

if (-not $SkipRust) {
  Invoke-Step "Tauri Rust check" {
    Push-Location src-tauri
    try {
      cargo check
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host "Quality check completed."
