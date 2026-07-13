$ErrorActionPreference = "Stop"

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

function Assert-SourceContains {
  param(
    [string]$Pattern,
    [string]$Message
  )

  $matches = Get-ChildItem src -Recurse -Include *.tsx,*.ts | Select-String -Pattern $Pattern
  if (-not $matches) {
    throw $Message
  }
}

Write-Host "== Accessibility baseline =="

Assert-Contains "index.html" '<html\s+lang="en"' "index.html must set the document language."
Assert-Contains "index.html" '<meta\s+name="viewport"' "index.html must include a viewport meta tag."
Assert-Contains "index.html" '<title>[^<]+' "index.html must include a document title."
Assert-Contains "src/components/ui/button.tsx" 'aria-label' "Shared Button must provide an accessible-name fallback for icon buttons."
Assert-SourceContains 'sr-only' "At least one screen-reader-only utility should be present for hidden accessible text."
Assert-SourceContains 'role="alert"' "At least one alert role should be present for status/error announcements."
Assert-SourceContains 'title=' "Interactive icon controls should expose hover/help text."

$rawButtons = Get-ChildItem src -Recurse -Include *.tsx | Select-String -Pattern '<button\b' -CaseSensitive
$untypedButtons = $rawButtons | Where-Object { $_.Line -notmatch 'type=' -and $_.Line -notmatch '<button\s+\{\.{3}' }
if ($untypedButtons) {
  $untypedButtons | Select-Object Path, LineNumber, Line
  throw "Raw button elements should declare type to avoid accidental form submission."
}

Write-Host "Accessibility baseline completed."
