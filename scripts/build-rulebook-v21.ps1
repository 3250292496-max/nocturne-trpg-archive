[CmdletBinding()]
param(
    [string]$Source,
    [string]$OutputDir = ".upgrade_v21\out",
    [string]$PdfDir = ".upgrade_v21\pdf",
    [switch]$SkipPdf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Managed document runtime was not found: $python"
}

if (-not $Source) {
    $Source = Get-ChildItem -LiteralPath (Join-Path $root "圣杯\零之圣杯_完整套件\规则书") -Filter "*v2.0*.docx" |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Source -or -not (Test-Path -LiteralPath $Source)) {
    throw "The v2.0 source rulebook was not found."
}

$resolvedOutput = [IO.Path]::GetFullPath((Join-Path $root $OutputDir))
$resolvedPdf = [IO.Path]::GetFullPath((Join-Path $root $PdfDir))
$splitDir = Join-Path $resolvedOutput "分册"
New-Item -ItemType Directory -Path $resolvedOutput, $resolvedPdf, $splitDir -Force | Out-Null

$fullDocx = Join-Path $resolvedOutput "《零之圣杯》Null Grail Core d20 v2.1_完整规则书.docx"
& $python (Join-Path $root ".upgrade_v21\build_rulebook_v21.py") $Source $fullDocx
if ($LASTEXITCODE -ne 0) { throw "Rulebook build failed." }

& $python (Join-Path $root "scripts\split-rulebook-v21.py") $fullDocx $splitDir
if ($LASTEXITCODE -ne 0) { throw "Rulebook split build failed." }

$docxFiles = @($fullDocx) + @(Get-ChildItem -LiteralPath $splitDir -Filter "*.docx" | ForEach-Object FullName)
foreach ($docxPath in $docxFiles) {
    $helperArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $root "scripts\word-finalize-one.ps1"),
        "-DocxPath", $docxPath
    )
    if (-not $SkipPdf) {
        $pdfPath = Join-Path $resolvedPdf (([IO.Path]::GetFileNameWithoutExtension($docxPath)) + ".pdf")
        $helperArgs += @("-PdfPath", $pdfPath)
    }
    & powershell.exe @helperArgs
    if ($LASTEXITCODE -ne 0) { throw "Word finalization failed for $docxPath" }
}

& (Join-Path $root "scripts\verify-rulebook-v21.ps1") -Path $fullDocx
if ($LASTEXITCODE -ne 0) { throw "The v2.1 verification gate failed." }

Write-Host "Built $($docxFiles.Count) DOCX files in $resolvedOutput"
if (-not $SkipPdf) { Write-Host "Exported PDFs to $resolvedPdf" }
