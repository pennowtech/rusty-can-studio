$ErrorActionPreference = "Stop"

function Assert-JsonField {
  param(
    [object]$Json,
    [string]$Name,
    [string]$Message
  )

  if (-not $Json.PSObject.Properties[$Name]) {
    throw $Message
  }
}

function Assert-Contains {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Message
  )

  $text = Get-Content $Path -Raw
  if ($text -notmatch $Pattern) {
    throw $Message
  }
}

Write-Host "== Browser compatibility baseline =="

$package = Get-Content package.json -Raw | ConvertFrom-Json
Assert-JsonField $package "browserslist" "package.json must define browserslist targets."

$targets = @($package.browserslist.production)
if ($targets.Count -eq 0) {
  throw "package.json browserslist.production must define production browser targets."
}

Assert-Contains "index.html" '<meta\s+name="viewport"' "index.html must include a viewport meta tag for responsive browser preview."
Assert-Contains "vite.config.ts" 'display:\s*"standalone"' "PWA manifest should keep standalone display metadata for installed browser previews."
Assert-Contains "vite.config.ts" 'theme_color' "PWA manifest should expose theme_color for browser install surfaces."

$sourceFiles = Get-ChildItem src -Recurse -Include *.ts,*.tsx,*.css
$directUserAgentChecks = $sourceFiles | Select-String -Pattern 'navigator\.userAgent|window\.chrome|InstallTrigger|safari\s+in\s+window' -CaseSensitive
if ($directUserAgentChecks) {
  $directUserAgentChecks | Select-Object Path, LineNumber, Line
  throw "Avoid browser-specific user-agent checks. Prefer feature detection or shared capability checks."
}

if (-not (Test-Path "dist/index.html")) {
  throw "dist/index.html was not found. Run npm run build before browser compatibility checks."
}

Assert-Contains "dist/index.html" '<script type="module"' "Production build should emit module script output."
Assert-Contains "dist/manifest.webmanifest" '"display"\s*:\s*"standalone"' "Built web manifest should keep standalone display mode."

Write-Host "Browser compatibility baseline completed."
