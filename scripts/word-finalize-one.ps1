[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DocxPath,
    [string]$PdfPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object Id)
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open((Resolve-Path -LiteralPath $DocxPath).Path, $false, $false)

    if ($doc.TablesOfContents.Count -eq 0) {
        foreach ($table in $doc.Tables) {
            if ($table.Rows.Count -lt 1 -or $table.Columns.Count -lt 3) { continue }
            $first = $table.Cell(1, 1).Range.Text.Trim([char]7, [char]13, [char]32)
            $second = $table.Cell(1, 2).Range.Text.Trim([char]7, [char]13, [char]32)
            $third = $table.Cell(1, 3).Range.Text.Trim([char]7, [char]13, [char]32)
            if ($first -eq "编号" -and $second -eq "内容" -and $third -eq "用途") {
                $range = $doc.Range($table.Range.Start, $table.Range.Start)
                [void]($doc.TablesOfContents.Add($range, $true, 1, 1))
                break
            }
        }
    }

    for ($index = 1; $index -le $doc.TablesOfContents.Count; $index++) {
        $doc.TablesOfContents.Item($index).Update()
    }
    [void]($doc.Fields.Update())
    $doc.Repaginate()
    $doc.Save()

    if ($PdfPath) {
        $fullPdfPath = [IO.Path]::GetFullPath($PdfPath)
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($fullPdfPath)) -Force | Out-Null
        $doc.ExportAsFixedFormat($fullPdfPath, 17)
        if (-not (Test-Path -LiteralPath $fullPdfPath)) { throw "Word did not create the PDF." }
    }
}
finally {
    $doc = $null
    $word = $null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    $after = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $before })
    foreach ($process in $after) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Finalized: $DocxPath"
