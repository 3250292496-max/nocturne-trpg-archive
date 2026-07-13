param(
  [switch]$SkipPublicBuild
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$publicSource = Join-Path $root '.secure-publish'
$bundleCandidates = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object {
  Test-Path -LiteralPath (Join-Path $_.FullName 'SHA256SUMS.txt') -PathType Leaf
})
if ($bundleCandidates.Count -ne 1) {
  throw "Expected exactly one upgrade bundle directory with SHA256SUMS.txt; found $($bundleCandidates.Count)."
}
$bundle = $bundleCandidates[0].FullName
$bundleName = $bundleCandidates[0].Name
$publicTargetCandidates = @(Get-ChildItem -LiteralPath $bundle -Directory | Where-Object {
  (Test-Path -LiteralPath (Join-Path $_.FullName 'player.html') -PathType Leaf) -and
  (Test-Path -LiteralPath (Join-Path $_.FullName 'gm.html') -PathType Leaf)
})
if ($publicTargetCandidates.Count -ne 1) {
  throw "Expected exactly one public web directory in the upgrade bundle; found $($publicTargetCandidates.Count)."
}
$publicTargetName = $publicTargetCandidates[0].Name
$publicTarget = $publicTargetCandidates[0].FullName
$checksumPath = Join-Path $bundle 'SHA256SUMS.txt'
$zipCandidates = @(Get-ChildItem -LiteralPath $root -File -Filter '*.zip' | Where-Object {
  $_.Name -like '*Null Grail v2.1*2026-07-13.zip'
})
if ($zipCandidates.Count -ne 1) {
  throw "Expected exactly one Null Grail v2.1 release ZIP; found $($zipCandidates.Count)."
}
$zipPath = $zipCandidates[0].FullName

function Assert-WorkspacePath([string]$path) {
  $full = [System.IO.Path]::GetFullPath($path)
  $rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the workspace: $full"
  }
  return $full
}

function Relative-Path([string]$base, [string]$path) {
  $basePrefix = [System.IO.Path]::GetFullPath($base).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $fullPath = [System.IO.Path]::GetFullPath($path)
  if (-not $fullPath.StartsWith($basePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the requested base directory: $fullPath"
  }
  return $fullPath.Substring($basePrefix.Length).Replace('\', '/')
}

function File-Manifest([string]$directory) {
  $manifest = @{}
  Get-ChildItem -LiteralPath $directory -Recurse -File -Force | ForEach-Object {
    $relative = Relative-Path $directory $_.FullName
    $manifest[$relative] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  return $manifest
}

if (-not $SkipPublicBuild) {
  Push-Location $root
  try {
    & node 'scripts/build-public-package.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Public package build failed.' }
    & node 'scripts/verify-public-package.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Public package verification failed.' }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $publicSource -PathType Container)) {
  throw "Missing public package source: $publicSource"
}
if (-not (Test-Path -LiteralPath $bundle -PathType Container)) {
  throw "Missing upgrade bundle directory: $bundle"
}

$publicTarget = Assert-WorkspacePath $publicTarget
if (Test-Path -LiteralPath $publicTarget) {
  Remove-Item -LiteralPath $publicTarget -Recurse -Force
}
Copy-Item -LiteralPath $publicSource -Destination $publicTarget -Recurse -Force

$sourceManifest = File-Manifest $publicSource
$targetManifest = File-Manifest $publicTarget
$sourceKeys = @($sourceManifest.Keys | Sort-Object)
$targetKeys = @($targetManifest.Keys | Sort-Object)
if (($sourceKeys -join "`n") -ne ($targetKeys -join "`n")) {
  throw 'Release public directory file list differs from .secure-publish.'
}
foreach ($relative in $sourceKeys) {
  if ($sourceManifest[$relative] -ne $targetManifest[$relative]) {
    throw "Release public file hash differs from .secure-publish: $relative"
  }
}

$requiredSentinels = @(
  @{ Path = 'player.html'; Text = 'id="player-map-open"' },
  @{ Path = 'player.html'; Text = 'id="player-map-view"' },
  @{ Path = 'player.js'; Text = "message.type === 'map-state'" },
  @{ Path = 'player.js'; Text = 'function mergePlayerMapPayload(' },
  @{ Path = 'player-data.js'; Text = 'publicMap: playerSafeMap' },
  @{ Path = 'gm.js'; Text = 'function publicMapPayload(' }
)
foreach ($sentinel in $requiredSentinels) {
  $content = [System.IO.File]::ReadAllText((Join-Path $publicTarget $sentinel.Path), [System.Text.Encoding]::UTF8)
  if (-not $content.Contains($sentinel.Text)) {
    throw "Release feature sentinel missing from $($sentinel.Path): $($sentinel.Text)"
  }
}

$checksumPath = Assert-WorkspacePath $checksumPath
$checksumLines = Get-ChildItem -LiteralPath $bundle -Recurse -File -Force |
  Where-Object { $_.FullName -ne $checksumPath } |
  ForEach-Object {
    $relative = Relative-Path $bundle $_.FullName
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    [PSCustomObject]@{ Relative = $relative; Line = "$hash  $relative" }
  } |
  Sort-Object Relative |
  ForEach-Object { $_.Line }
[System.IO.File]::WriteAllLines($checksumPath, [string[]]$checksumLines, [System.Text.UTF8Encoding]::new($false))

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = Assert-WorkspacePath $zipPath
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $bundle,
  $zipPath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $true
)

$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $expectedEntry = ($bundleName + '/' + $publicTargetName + '/player.html')
  $playerEntry = $archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $expectedEntry } | Select-Object -First 1
  if (-not $playerEntry) { throw 'Final ZIP is missing the player page.' }
  $reader = [System.IO.StreamReader]::new($playerEntry.Open(), [System.Text.Encoding]::UTF8)
  try { $zippedPlayerHtml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if (-not $zippedPlayerHtml.Contains('id="player-map-open"') -or -not $zippedPlayerHtml.Contains('id="player-map-view"')) {
    throw 'Final ZIP contains a player page without the interactive map.'
  }
} finally {
  $archive.Dispose()
}

$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Upgrade bundle rebuilt: $zipPath"
Write-Host "ZIP SHA256: $zipHash"
