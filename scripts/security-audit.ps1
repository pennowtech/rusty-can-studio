param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command,
    [switch]$Optional
  )

  Write-Host ""
  Write-Host "== $Name =="
  try {
    & $Command
  } catch {
    if ($Optional) {
      Write-Warning $_.Exception.Message
      return
    }
    throw
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command exited with code $LASTEXITCODE."
  }
}

Invoke-Step "npm audit" {
  Invoke-Native npm audit --audit-level=moderate
}

Invoke-Step "cargo audit" {
  if (-not (Get-Command cargo-audit -ErrorAction SilentlyContinue) -and -not (cargo --list | Select-String -Quiet "^    audit")) {
    throw "cargo-audit is not installed. Install it with: cargo install cargo-audit"
  }

  Push-Location src-tauri
  try {
    Invoke-Native cargo audit
  } finally {
    Pop-Location
  }
} -Optional

Invoke-Step "secret pattern scan" {
  $patterns = @(
    "-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "ghp_[A-Za-z0-9_]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}",
    "xox[baprs]-[A-Za-z0-9-]{10,}",
    "AKIA[0-9A-Z]{16}",
    "AIza[0-9A-Za-z_-]{20,}"
  )
  $excluded = @(".git", "node_modules", "dist", "target", ".agents")
  $files = Get-ChildItem -Recurse -File | Where-Object {
    $path = $_.FullName
    -not ($excluded | Where-Object { $path -like "*\$_\*" })
  }
  $hits = foreach ($pattern in $patterns) {
    $files | Select-String -Pattern $pattern -ErrorAction SilentlyContinue
  }
  if ($hits) {
    $hits | Select-Object Path, LineNumber, Line
    throw "Potential secret pattern found."
  }
  Write-Host "No obvious secret patterns found."
}

if ($Strict) {
  Invoke-Step "dependency freshness" {
    Invoke-Native npm outdated
  } -Optional
}

Write-Host ""
Write-Host "Security audit completed."
