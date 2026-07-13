[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Path,

    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RulebookPath {
    param([string]$RequestedPath)

    if ($RequestedPath) {
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $root = (Get-Location).Path
    $preferred = Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match 'v2\.1' -and $_.Extension -match '^\.(docx|txt|md|json)$' -and
            $_.Name -notmatch '^~\$'
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $preferred) {
        throw "No v2.1 DOCX/TXT/MD/JSON was found. Pass the rulebook path explicitly."
    }

    return $preferred.FullName
}

function Get-WordNodeText {
    param(
        [System.Xml.XmlNode]$Node,
        [System.Xml.XmlNamespaceManager]$NamespaceManager
    )

    $builder = New-Object System.Text.StringBuilder
    foreach ($part in $Node.SelectNodes('.//w:t | .//w:tab | .//w:br | .//w:cr', $NamespaceManager)) {
        switch ($part.LocalName) {
            't'   { [void]$builder.Append($part.InnerText) }
            'tab' { [void]$builder.Append("`t") }
            default { [void]$builder.Append("`n") }
        }
    }
    return $builder.ToString()
}

function Read-DocxPayload {
    param([string]$DocxPath)

    Add-Type -AssemblyName System.IO.Compression

    $stream = [System.IO.File]::Open(
        $DocxPath,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
    )
    $archive = [System.IO.Compression.ZipArchive]::new(
        $stream,
        [System.IO.Compression.ZipArchiveMode]::Read,
        $false
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $tables = @()

    try {
        $partNames = New-Object System.Collections.Generic.List[string]
        [void]$partNames.Add('word/document.xml')
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '^word/(header|footer)\d+\.xml$' -or
                $entry.FullName -match '^word/(footnotes|endnotes)\.xml$') {
                [void]$partNames.Add($entry.FullName)
            }
        }

        foreach ($partName in $partNames) {
            $entry = $archive.GetEntry($partName)
            if (-not $entry) {
                continue
            }

            $reader = [System.IO.StreamReader]::new($entry.Open())
            try {
                [xml]$xml = $reader.ReadToEnd()
            }
            finally {
                $reader.Dispose()
            }

            $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
            $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

            foreach ($paragraph in $xml.SelectNodes('//w:p', $ns)) {
                $paragraphText = Get-WordNodeText -Node $paragraph -NamespaceManager $ns
                if (-not [string]::IsNullOrWhiteSpace($paragraphText)) {
                    [void]$lines.Add($paragraphText.Trim())
                }
            }

            if ($partName -ne 'word/document.xml') {
                continue
            }

            $tableNumber = 0
            foreach ($table in $xml.SelectNodes('//w:tbl', $ns)) {
                $tableNumber++
                $rowTexts = New-Object System.Collections.Generic.List[string]
                $rows = @($table.SelectNodes('./w:tr', $ns))
                foreach ($row in $rows) {
                    $cellTexts = New-Object System.Collections.Generic.List[string]
                    foreach ($cell in $row.SelectNodes('./w:tc', $ns)) {
                        $cellParts = New-Object System.Collections.Generic.List[string]
                        foreach ($paragraph in $cell.SelectNodes('./w:p', $ns)) {
                            $cellText = Get-WordNodeText -Node $paragraph -NamespaceManager $ns
                            if (-not [string]::IsNullOrWhiteSpace($cellText)) {
                                [void]$cellParts.Add($cellText.Trim())
                            }
                        }
                        [void]$cellTexts.Add(($cellParts -join ' / '))
                    }
                    $rowText = $cellTexts -join ' | '
                    [void]$rowTexts.Add($rowText)
                    if (-not [string]::IsNullOrWhiteSpace($rowText)) {
                        [void]$lines.Add("TABLE_ROW: $rowText")
                    }
                }

                $firstRowIsHeader = $false
                if ($rows.Count -gt 0) {
                    $headerNode = $rows[0].SelectSingleNode('./w:trPr/w:tblHeader', $ns)
                    if ($headerNode) {
                        $value = $headerNode.GetAttribute(
                            'val',
                            'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
                        )
                        $firstRowIsHeader = ($value -notmatch '^(0|false|off)$')
                    }
                }

                $allTableText = $rowTexts -join "`n"
                $isFillable = $allTableText -match '(填写|玩家填写|角色卡|契约模块|_{4,}|【\s*】|□|☐)'
                $firstRowColumnCount = 0
                if ($rows.Count -gt 0) {
                    $firstRowColumnCount = @($rows[0].SelectNodes('./w:tc', $ns)).Count
                }
                $tables += [pscustomobject]@{
                    Number           = $tableNumber
                    RowCount         = $rows.Count
                    ColumnCount      = $firstRowColumnCount
                    FirstRowText     = $(if ($rowTexts.Count -gt 0) { $rowTexts[0] } else { '' })
                    HasHeaderSemantic = $firstRowIsHeader
                    IsFillable       = $isFillable
                }
            }
        }
    }
    finally {
        $archive.Dispose()
        $stream.Dispose()
    }

    return [pscustomobject]@{
        Text   = $lines -join "`n"
        Tables = $tables
    }
}

function Convert-ToCanonicalText {
    param([string]$Value)

    $result = $Value
    $result = $result -replace '[‐‑‒–—−－]', '-'
    $result = $result -replace '[＋﹢]', '+'
    $result = $result -replace '[≥⩾]', '>='
    $result = $result -replace '[≤⩽]', '<='
    $result = $result -replace '[＝﹦]', '='
    $result = $result -replace '[／]', '/'
    $result = $result -replace '[：]', ':'
    $result = $result -replace '[；]', ';'
    $result = $result -replace '[，]', ','
    $result = $result -replace '[（]', '('
    $result = $result -replace '[）]', ')'
    return $result
}

function Convert-JsonToText {
    param([string]$JsonText)

    $root = $JsonText | ConvertFrom-Json
    $values = New-Object System.Collections.Generic.List[string]

    function Add-JsonValue {
        param([object]$Value)

        if ($null -eq $Value) {
            return
        }
        if ($Value -is [string]) {
            if (-not [string]::IsNullOrWhiteSpace($Value)) {
                [void]$values.Add($Value)
            }
            return
        }
        if ($Value -is [System.Collections.IDictionary]) {
            foreach ($key in $Value.Keys) {
                Add-JsonValue -Value $Value[$key]
            }
            return
        }
        if ($Value -is [System.Collections.IEnumerable]) {
            foreach ($item in $Value) {
                Add-JsonValue -Value $item
            }
            return
        }
        if ($Value -is [pscustomobject]) {
            foreach ($property in $Value.PSObject.Properties) {
                Add-JsonValue -Value $property.Value
            }
        }
    }

    Add-JsonValue -Value $root
    return $values -join "`n"
}

function Test-Pattern {
    param(
        [string]$Value,
        [string]$Pattern,
        [switch]$SingleLine
    )

    $options = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    if ($SingleLine) {
        $options = $options -bor [System.Text.RegularExpressions.RegexOptions]::Singleline
    }
    return [System.Text.RegularExpressions.Regex]::IsMatch($Value, $Pattern, $options)
}

function Test-AllPatterns {
    param(
        [string]$Value,
        [string[]]$Patterns,
        [switch]$SingleLine
    )

    foreach ($pattern in $Patterns) {
        if (-not (Test-Pattern -Value $Value -Pattern $pattern -SingleLine:$SingleLine)) {
            return $false
        }
    }
    return $true
}

function Test-AnyPattern {
    param(
        [string]$Value,
        [string[]]$Patterns,
        [switch]$SingleLine
    )

    foreach ($pattern in $Patterns) {
        if (Test-Pattern -Value $Value -Pattern $pattern -SingleLine:$SingleLine) {
            return $true
        }
    }
    return $false
}

function Get-LastSectionText {
    param(
        [string]$Value,
        [string]$StartPattern,
        [string]$EndPattern
    )

    $options = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    $startMatches = [regex]::Matches($Value, $StartPattern, $options)
    if ($startMatches.Count -eq 0) {
        return ''
    }
    $start = $startMatches[$startMatches.Count - 1].Index

    $tail = $Value.Substring($start)
    $endMatch = [regex]::Match($tail, $EndPattern, $options)
    if ($endMatch.Success -and $endMatch.Index -gt 0) {
        return $tail.Substring(0, $endMatch.Index)
    }
    return $tail
}

$script:Checks = @()

function Add-Check {
    param(
        [string]$Id,
        [string]$Description,
        [ValidateSet('PASS', 'FAIL', 'SKIP')]
        [string]$Status,
        [string]$Evidence
    )

    $script:Checks += [pscustomobject]@{
        Id          = $Id
        Description = $Description
        Status      = $Status
        Evidence    = $Evidence
    }
}

$resolvedPath = Resolve-RulebookPath -RequestedPath $Path
$extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
$isDocx = $extension -eq '.docx'

if ($isDocx) {
    $payload = Read-DocxPayload -DocxPath $resolvedPath
    $rawText = $payload.Text
    $tableData = $payload.Tables
}
elseif ($extension -eq '.json') {
    $rawText = Convert-JsonToText -JsonText ([System.IO.File]::ReadAllText($resolvedPath))
    $tableData = @()
}
elseif ($extension -eq '.txt' -or $extension -eq '.md') {
    $rawText = [System.IO.File]::ReadAllText($resolvedPath)
    $tableData = @()
}
else {
    throw "Unsupported input type '$extension'. Use DOCX, TXT, MD, or an exported-text JSON."
}

$text = Convert-ToCanonicalText -Value $rawText
$flat = ($text -replace '\s+', ' ').Trim()
$compact = $text -replace '\s+', ''

# 01 - Version identity
$versionOk = (Test-AnyPattern -Value $flat -Patterns @(
        '核心.{0,40}v2\.1',
        'v2\.1.{0,40}(平衡|修订|规则书)'
    ) -SingleLine) -and
    -not (Test-Pattern -Value $flat -Pattern '核心精修版\s*v2\.0' -SingleLine)
Add-Check 'VERSION' 'The document identifies itself as the v2.1 revision.' $(if ($versionOk) { 'PASS' } else { 'FAIL' }) 'Require a v2.1 title/version marker; reject the old v2.0 front-title marker.'

# 02 - Known conflicting v2.0 wording must be gone.
$oldConflictPatterns = @(
    'DC\s*-\s*1\s*至\s*(?:DC\s*)?-\s*4',
    'TABLE_ROW:\s*大成功\s*\|\s*总值\s*>=\s*DC\s*\+\s*5',
    '攻击者.{0,12}设定\s*DC',
    '到自己下回合开始时刷新',
    '轮末刷新反应',
    'TABLE_ROW:\s*开始\s*\|\s*处理持续伤害',
    '持续伤害.{0,20}开始阶段',
    '偏转凶兆.{0,120}将结果降低一档',
    '绝对强化.{0,100}一次结果提升为大成功',
    '重击\s*\+\s*5\s*[,、]\s*7\s*伤害'
)
$remainingConflicts = New-Object System.Collections.Generic.List[string]
foreach ($pattern in $oldConflictPatterns) {
    if (Test-Pattern -Value $flat -Pattern $pattern -SingleLine) {
        [void]$remainingConflicts.Add($pattern)
    }
}
$oldConflictOk = $remainingConflicts.Count -eq 0
Add-Check 'OLD_TEXT' 'Known v2.0 conflict wording has been removed.' $(if ($oldConflictOk) { 'PASS' } else { 'FAIL' }) $(if ($oldConflictOk) { 'No forbidden legacy phrase found.' } else { 'Matched forbidden patterns: ' + ($remainingConflicts -join '; ') })

# 03 - Correct 14/15 point-buy examples and arrays.
$ordinaryBudgetOk = (Test-Pattern -Value $text -Pattern '(?m)^[^\r\n]*普通人[^\r\n]*(?:14\s*点|=\s*14|总成本[^\r\n]*14)') -or
    (Test-Pattern -Value $flat -Pattern '普通人(?:(?!魔术师).){0,120}(?:14\s*点|=\s*14|总成本.{0,30}14)' -SingleLine)
$magusBudgetOk = (Test-Pattern -Value $text -Pattern '(?m)^[^\r\n]*魔术师[^\r\n]*(?:15\s*点|=\s*15|总成本[^\r\n]*15)') -or
    (Test-Pattern -Value $flat -Pattern '魔术师(?:(?!从者).){0,120}(?:15\s*点|=\s*15|总成本.{0,30}15)' -SingleLine)
$budgetArraysOk = Test-AllPatterns -Value $text -Patterns @(
    '3\s*[、,]\s*2\s*[、,]\s*2\s*[、,]\s*1\s*[、,]\s*1\s*[、,]\s*0\s*[、,]\s*0',
    '3\s*[、,]\s*2\s*[、,]\s*2\s*[、,]\s*1\s*[、,]\s*1\s*[、,]\s*1\s*[、,]\s*0'
)
$budgetRequired = $ordinaryBudgetOk -and $magusBudgetOk -and $budgetArraysOk
$badBudget = (Test-Pattern -Value $text -Pattern '(?m)普通人(?:(?!魔术师)[^\r\n]){0,100}15\s*点') -or
    (Test-Pattern -Value $text -Pattern '(?m)魔术师(?:(?!从者)[^\r\n]){0,100}17\s*点')
$budgetOk = $budgetRequired -and -not $badBudget
Add-Check 'BUDGETS' 'Point-buy examples preserve ordinary-human 14 and magus 15 budgets.' $(if ($budgetOk) { 'PASS' } else { 'FAIL' }) 'Require both quick arrays and 14/15 budget examples; reject ordinary-human 15 or magus 17.'

# 04 - Partial-success boundary and combat exclusions.
$partialOk = (Test-Pattern -Value $flat -Pattern 'DC\s*-\s*1\s*至\s*(?:DC\s*)?-\s*2' -SingleLine) -and
    (Test-Pattern -Value $flat -Pattern '攻击.{0,20}抵抗.{0,20}对抗.{0,20}反制.{0,20}濒死.{0,20}宝具对冲.{0,40}(?:不适用|不可使用|不能使用|禁用).{0,20}带代价成功|攻击.{0,20}抵抗.{0,20}对抗.{0,20}反制.{0,20}濒死.{0,20}宝具对冲.{0,40}带代价成功.{0,20}(?:不适用|不可使用|不能使用|禁用)|带代价成功.{0,320}攻击.{0,20}抵抗.{0,20}对抗.{0,20}反制.{0,20}濒死.{0,20}宝具对冲.{0,40}(?:不适用|不可使用|不能使用|禁用)' -SingleLine) -and
    -not (Test-Pattern -Value $flat -Pattern 'DC\s*-\s*1\s*至\s*(?:DC\s*)?-\s*4' -SingleLine)
Add-Check 'PARTIAL_SUCCESS' 'Partial success is DC-1 to DC-2 and excluded from combat/resistance families.' $(if ($partialOk) { 'PASS' } else { 'FAIL' }) 'Need DC-1..DC-2 plus explicit exclusions for attack, resistance, contest, counter, dying, and Noble Phantasm clash.'

# 05 - Critical threshold.
$criticalOk = (Test-AnyPattern -Value $flat -Patterns @(
        '战斗大成功.{0,120}(?:防御|DC|高出)\s*(?:\+\s*)?8',
        '大成功.{0,100}战斗.{0,80}(?:防御|DC)\s*\+\s*8',
        '战斗.{0,80}(?:防御|DC)\s*\+\s*8.{0,80}大成功'
    ) -SingleLine) -and
    -not (Test-Pattern -Value $flat -Pattern '战斗大成功.{0,100}(?:防御|DC|高出)\s*(?:\+\s*)?5' -SingleLine)
Add-Check 'CRITICAL_PLUS8' 'Combat great success uses defense/DC +8.' $(if ($criticalOk) { 'PASS' } else { 'FAIL' }) 'Require a combat-specific +8 threshold and reject a remaining +5 combat threshold.'

# 06 - Natural 1 and 20.
$naturalOk = (Test-Pattern -Value $flat -Pattern '自然\s*1.{0,30}(?:为|视为)?失败' -SingleLine) -and
    (Test-Pattern -Value $flat -Pattern '自然\s*20.{0,50}原本成功.{0,30}(?:视为|成为)大成功' -SingleLine)
Add-Check 'NATURAL_ROLLS' 'Natural 1 fails; natural 20 upgrades an otherwise successful roll.' $(if ($naturalOk) { 'PASS' } else { 'FAIL' }) 'Require both natural-roll clauses.'

# 07 - Nine-step action timing.
$actionTimingOk = Test-Pattern -Value $flat -Pattern '(?:(?:行动|结算).{0,200}(?:九步|时序|流程)|(?:唯一)?九步.{0,80}(?:行动|结算)).{0,900}声明.{0,260}合法性.{0,260}(?:目标值|固定\s*DC.{0,30}防御).{0,260}支付.{0,260}掷骰前.{0,80}反应.{0,240}掷骰.{0,300}命中后.{0,80}反应.{0,300}伤害.{0,100}状态.{0,320}冷却.{0,100}余波' -SingleLine
Add-Check 'ACTION_TIMING' 'The nine-step action timing includes both reaction windows and aftermath.' $(if ($actionTimingOk) { 'PASS' } else { 'FAIL' }) 'Expected order: declaration, legality, target number, payment, pre-roll reaction, roll, post-hit reaction, damage/status, cooldown/aftermath.'

# 08 - Damage pipeline.
$damagePipelineOk = Test-Pattern -Value $flat -Pattern '(?:伤害顺序|伤害管线|伤害结算).{0,500}基础伤害.{0,160}(?:类型.{0,60}大成功|大成功.{0,60}类型).{0,180}(?:一个|最高一个)?.{0,40}反应.{0,180}护盾.{0,180}护甲.{0,180}(?:生命损失|失去生命|扣除生命).{0,180}(?:重创.{0,60}状态|状态.{0,60}重创)' -SingleLine
Add-Check 'DAMAGE_PIPELINE' 'Damage resolves in the declared single-pass order.' $(if ($damagePipelineOk) { 'PASS' } else { 'FAIL' }) 'Expected: base -> type/great success -> one reaction -> shield -> armor -> HP -> trauma/status.'

# 09 - Reactions refresh once at round start.
$reactionOk = (Test-Pattern -Value $flat -Pattern '每轮开始.{0,40}(?:统一)?刷新反应' -SingleLine) -and
    -not (Test-AnyPattern -Value $flat -Patterns @('到自己下回合开始时刷新', '轮末刷新反应') -SingleLine)
Add-Check 'REACTION_REFRESH' 'Reactions refresh uniformly at round start.' $(if ($reactionOk) { 'PASS' } else { 'FAIL' }) 'Reject personal-turn or round-end refresh wording.'

# 10 - Ready action consumes the main action now and the reaction at trigger.
$readyOk = Test-Pattern -Value $flat -Pattern '准备.{0,220}(?:消耗|使用|支付).{0,30}主要动作.{0,220}触发时.{0,80}(?:消耗|使用|支付).{0,20}反应' -SingleLine
Add-Check 'READY_ACTION' 'Ready action pays a main action and later a reaction.' $(if ($readyOk) { 'PASS' } else { 'FAIL' }) 'Both costs must be explicit.'

# 11 - Bleeding timing.
$bleedOk = (Test-Pattern -Value $flat -Pattern '流血.{0,120}(?:目标|自己|该角色)?回合结束' -SingleLine) -and
    -not (Test-AnyPattern -Value $flat -Patterns @('TABLE_ROW:\s*开始\s*\|\s*处理持续伤害', '持续伤害.{0,20}开始阶段') -SingleLine)
Add-Check 'BLEED_TIMING' 'Bleeding ticks at the affected target turn end.' $(if ($bleedOk) { 'PASS' } else { 'FAIL' }) 'Reject start-phase persistent damage.'

# 12 - Zero HP state and stabilization.
$zeroHpOk = Test-AnyPattern -Value $flat -Patterns @(
    '(?:生命值归零|生命值降至\s*0|生命降至\s*0|0\s*生命值).{0,700}(?:不能|无法).{0,20}移动.{0,200}(?:不能|无法|失去).{0,40}次要动作.{0,200}(?:不能|无法|失去).{0,30}反应.{0,360}稳定.{0,180}(?:不恢复行动|仍为?\s*0\s*生命值|仍然倒地|恢复到至少\s*1\s*生命.{0,30}解除倒地)',
    '(?:生命值归零|生命值降至\s*0|生命降至\s*0|0\s*生命值).{0,700}(?:不能|无法)移动.{0,100}(?:主要/次要动作|主要.{0,10}次要动作).{0,100}反应.{0,360}稳定.{0,180}(?:不恢复行动|仍为?\s*0\s*生命值|仍然倒地|恢复到至少\s*1\s*生命.{0,30}解除倒地)'
) -SingleLine
Add-Check 'ZERO_HP' 'Zero HP removes normal movement/minor/reaction access; stabilization does not restore actions.' $(if ($zeroHpOk) { 'PASS' } else { 'FAIL' }) 'Require an explicit incapacitation and stabilization boundary.'

# 13 - Fixed area DCs.
$areaDcOk = (Test-Pattern -Value $flat -Pattern '(?:范围攻击|范围\s*DC|爆炸/范围).{0,260}(?:(?:固定|写在|写明|能力卡).{0,80}DC|DC.{0,80}(?:固定|写在|写明|能力卡)).{0,260}13.{0,80}16.{0,80}19' -SingleLine) -and
    -not (Test-Pattern -Value $flat -Pattern '攻击者.{0,12}设定\s*DC' -SingleLine)
Add-Check 'AREA_DC' 'Area DC is card-fixed with 13/16/19 benchmarks.' $(if ($areaDcOk) { 'PASS' } else { 'FAIL' }) 'The attacker may not choose DC at resolution time.'

# 14 - Modifier categories and caps.
$modifierOk = (Test-Pattern -Value $flat -Pattern '(?:强化|装备|工房).{0,180}(?:强化|装备|工房).{0,180}(?:强化|装备|工房).{0,160}(?:最高一个|只取最高).{0,80}\+\s*2' -SingleLine) -and
    (Test-Pattern -Value $flat -Pattern '团队加值.{0,80}(?:最高|上限|最多).{0,30}\+\s*1' -SingleLine) -and
    (Test-Pattern -Value $flat -Pattern '职阶相性.{0,160}概念克制.{0,160}环境.{0,160}(?:最高一个|只取最高|取最高)' -SingleLine)
Add-Check 'MODIFIER_CATEGORIES' 'Modifier categories cap enhancement at +2 and team support at +1.' $(if ($modifierOk) { 'PASS' } else { 'FAIL' }) 'Require one enhancement/equipment/workshop bonus, one team bonus, and a single situation bonus.'

# 15 - Sustained-effect slots.
$slotOk = Test-Pattern -Value $flat -Pattern '维持槽.{0,80}(?:=|等于).{0,20}1\s*\+\s*魔力.{0,100}(?:最高|上限|最多)\s*5' -SingleLine
Add-Check 'SUSTAIN_SLOTS' 'Sustained effects use 1 + Magic slots, capped at 5.' $(if ($slotOk) { 'PASS' } else { 'FAIL' }) 'Require both formula and hard cap.'

# 16 - Strain and resource-recovery ceilings.
$strainOk = Test-Pattern -Value $flat -Pattern '负荷.{0,220}(?:本|当前)场景.{0,100}(?:不能|不可|无法).{0,30}治疗' -SingleLine
$roundRecoveryOk = Test-AnyPattern -Value $flat -Patterns @(
    '非令咒.{0,120}每轮.{0,100}(?:最多|上限).{0,20}2\s*MP',
    '每轮.{0,120}非令咒.{0,100}(?:最多|上限).{0,20}2\s*MP'
) -SingleLine
$shortRestOk = Test-Pattern -Value $flat -Pattern '短休.{0,260}2\s*(?:MP\s*)?\+\s*最高一个.{0,160}(?:最多|上限).{0,20}4\s*(?:MP)?' -SingleLine
$fullRestOk = Test-Pattern -Value $flat -Pattern '完整休整.{0,260}至少\s*6\s*小时.{0,200}每\s*24\s*小时.{0,80}(?:一次|最多一次)' -SingleLine
$resourceOk = $strainOk -and $roundRecoveryOk -and $shortRestOk -and $fullRestOk
$resourceEvidence = if ($resourceOk) {
    'Strain, per-round MP, short-rest, and full-rest ceilings are all present.'
}
else {
    "Require strain, 2 MP/round non-command recovery, short-rest 4 MP cap, and 6h/24h full rest. Matches: strain=$strainOk roundMP=$roundRecoveryOk shortRest=$shortRestOk fullRest=$fullRestOk"
}
Add-Check 'RESOURCE_CAPS' 'Strain cannot be healed in-scene; MP and rest recovery have hard ceilings.' $(if ($resourceOk) { 'PASS' } else { 'FAIL' }) $resourceEvidence

# 17 - Heavy attack and power attack are mutually exclusive.
$heavyOk = (Test-AnyPattern -Value $flat -Patterns @(
        '重型攻击.{0,160}重击.{0,160}(?:不可叠加|不能叠加|互斥|同一标签)',
        '重击.{0,160}重型攻击.{0,160}(?:不可叠加|不能叠加|互斥|同一标签)'
    ) -SingleLine) -and
    (Test-AnyPattern -Value $flat -Patterns @(
        '重型攻击.{0,180}(?:命中|攻击).{0,30}-\s*4.{0,100}伤害.{0,30}\+\s*2',
        '从者普通/重型攻击.{0,100}5/7.{0,120}重型攻击.{0,60}命中\s*-\s*4'
    ) -SingleLine)
Add-Check 'HEAVY_ATTACK' 'Heavy attack is -4/+2 and cannot stack with Power Attack.' $(if ($heavyOk) { 'PASS' } else { 'FAIL' }) 'Require both numeric trade-off and mutual exclusion.'

# 18 - Revised class features.
$berserkerOk = Test-Pattern -Value $flat -Pattern 'Berserker.{0,500}狂化.{0,120}次要(?:动作)?.{0,80}1\s*MP.{0,160}下回合.{0,160}\+\s*2\s*伤害.{0,200}(?:不能闪避|防御\s*-\s*2)' -SingleLine
$archerOk = Test-AnyPattern -Value $flat -Patterns @(
    'Archer.{0,400}(?:越距|距离惩罚).{0,160}(?:忽略|无视)',
    'Archer.{0,400}(?:忽略|无视).{0,160}(?:越距|距离惩罚)'
) -SingleLine
$riderOk = Test-Pattern -Value $flat -Pattern 'Rider.{0,400}(?:额外移动|免费保护.{0,20}乘员|保护乘员)' -SingleLine
$casterOk = Test-Pattern -Value $flat -Pattern 'Caster.{0,500}(?:阵地作成|阵地).{0,220}工房界.{0,160}(?:不叠加|不能叠加|同源)' -SingleLine
$classesOk = $berserkerOk -and $archerOk -and $riderOk -and $casterOk
Add-Check 'CLASS_REVISIONS' 'Berserker, Archer, Rider, and Caster use the revised class package.' $(if ($classesOk) { 'PASS' } else { 'FAIL' }) 'Require Berserker action/cost/drawback, explicit Archer range rule, Rider combat mobility/protection, and Caster/workshop non-stacking.'

# 19 - Command Spell action types and single-choice effects.
$commandChoiceOk = Test-AnyPattern -Value $flat -Patterns @(
    '(?:每画|一画令咒).{0,320}(?:只能|仅能).{0,60}(?:一个|一项).{0,40}(?:效果|用途)',
    '一画令咒.{0,600}二者只能选一'
) -SingleLine
$commandNames = @('绝对强化', '空间召回', '续行供魔', '明确命令')
$commandTypesOk = $true
foreach ($commandName in $commandNames) {
    $commandPattern = [regex]::Escape($commandName) + '.{0,160}(?:主要动作|次要动作|反应|自由动作|无需动作|特殊动作)'
    if (-not (Test-Pattern -Value $flat -Pattern $commandPattern -SingleLine)) {
        $commandTypesOk = $false
    }
}
$combinedCommandBad = Test-Pattern -Value $flat -Pattern '提升.{0,40}大成功.{0,80}(?:并|同时).{0,40}补足.{0,20}3\s*MP' -SingleLine
$commandOk = $commandChoiceOk -and $commandTypesOk -and -not $combinedCommandBad
Add-Check 'COMMAND_SPELLS' 'Each Command Spell use has an action type and selects one effect per seal.' $(if ($commandOk) { 'PASS' } else { 'FAIL' }) 'Require action types for four standard uses; reject combining great-success upgrade with 3 MP refill.'

# 20 - Open/custom spell schema.
$openSpellOk = Test-Pattern -Value $flat -Pattern '术式模板.{0,1400}(?:目标.{0,30}范围|目标/范围).{0,300}(?:检定.{0,20}抵抗|检定/抵抗|检定或抵抗).{0,400}数值上限.{0,300}失败.{0,300}持续.{0,300}反制' -SingleLine
if (-not $openSpellOk) {
    $openSpellSection = Get-LastSectionText -Value $flat -StartPattern '(?:开放术式|开放式术式|自定义术式|术式模板)' -EndPattern '(?:宝具模板|魔术礼装|示例敌人|附录\s*[D-E])'
    $openSpellOk = $openSpellSection -ne '' -and
        (Test-AllPatterns -Value $openSpellSection -Patterns @(
            '目标.{0,30}范围|目标/范围',
            '检定.{0,20}抵抗|检定/抵抗|检定或抵抗',
            '持续',
            '失败',
            '反制',
            '数值上限|上限'
        ) -SingleLine)
}
Add-Check 'OPEN_SPELL_FIELDS' 'Open/custom spells require target/range, check/resistance, duration, failure, counterplay, and numeric cap.' $(if ($openSpellOk) { 'PASS' } else { 'FAIL' }) 'All six schema fields must appear in the open-spell section.'

# 21 - Victory conditions for all four campaign frameworks.
$frameworkSpecs = @(
    [pscustomobject]@{ Name = '冬木式'; Start = 'A\s*[|｜]\s*冬木式'; End = 'B\s*[|｜]\s*圣杯大战式' },
    [pscustomobject]@{ Name = '圣杯大战式'; Start = 'B\s*[|｜]\s*圣杯大战式'; End = 'C\s*[|｜]\s*月之圣杯战争式' },
    [pscustomobject]@{ Name = '月之圣杯战争式'; Start = 'C\s*[|｜]\s*月之圣杯战争式'; End = 'D\s*[|｜]\s*Grand\s*Order' },
    [pscustomobject]@{ Name = 'Grand Order式'; Start = 'D\s*[|｜]\s*Grand\s*Order'; End = '自定义战役检查表' }
)
$victoryMissing = New-Object System.Collections.Generic.List[string]
foreach ($framework in $frameworkSpecs) {
    $section = Get-LastSectionText -Value $flat -StartPattern $framework.Start -EndPattern $framework.End
    $frameworkOk = $section -ne '' -and
        (Test-AnyPattern -Value $section -Patterns @('参战资格', '获胜资格', '资格')) -and
        (Test-AnyPattern -Value $section -Patterns @('胜利推进', '推进胜利', '控制钟', '目标钟')) -and
        (Test-AnyPattern -Value $section -Patterns @('即时结束', '立即结束', '结束触发')) -and
        (Test-Pattern -Value $section -Pattern '平局') -and
        (Test-AnyPattern -Value $section -Patterns @('退赛', '退赛/投降', '撤退')) -and
        (Test-AnyPattern -Value $section -Patterns @('第三方夺取', '第三方'))
    if (-not $frameworkOk) {
        [void]$victoryMissing.Add($framework.Name)
    }
}
$victoryOk = $victoryMissing.Count -eq 0
Add-Check 'VICTORY_CONDITIONS' 'Every campaign framework defines eligibility, progress, end, tie, exit, and third-party capture.' $(if ($victoryOk) { 'PASS' } else { 'FAIL' }) $(if ($victoryOk) { 'All four frameworks contain all six fields.' } else { 'Incomplete frameworks: ' + ($victoryMissing -join ', ') })

# 22 - Replacement-character and mojibake gate.
$hasReplacementChar = $rawText.IndexOf([char]0xFFFD) -ge 0
$hasSuspiciousAsciiQuestion = Test-Pattern -Value $rawText -Pattern '(?<=[A-Za-z0-9一-龥])\s*\?\s*(?=[A-Za-z0-9一-龥])'
$replacementOk = -not $hasReplacementChar -and -not $hasSuspiciousAsciiQuestion
Add-Check 'TEXT_INTEGRITY' 'No U+FFFD or suspicious ASCII-question-mark arrow replacement remains.' $(if ($replacementOk) { 'PASS' } else { 'FAIL' }) $(if ($replacementOk) { 'No replacement marker found.' } else { "U+FFFD=$hasReplacementChar; suspicious ?=$hasSuspiciousAsciiQuestion" })

# 23 - OOXML table-header semantics. Fillable character sheets are exempt.
if ($isDocx) {
    $eligibleTables = @($tableData | Where-Object {
            $_.RowCount -gt 1 -and $_.ColumnCount -gt 1 -and -not $_.IsFillable
        })
    $missingHeaderTables = @($eligibleTables | Where-Object { -not $_.HasHeaderSemantic })
    $tableHeaderOk = $eligibleTables.Count -gt 0 -and $missingHeaderTables.Count -eq 0
    $headerEvidence = if ($tableHeaderOk) {
        "All $($eligibleTables.Count) non-fillable multi-row tables mark the first row as w:tblHeader."
    }
    else {
        $sample = $missingHeaderTables | Select-Object -First 8 | ForEach-Object {
            "#$($_.Number) '$($_.FirstRowText)'"
        }
        "Missing w:tblHeader on $($missingHeaderTables.Count)/$($eligibleTables.Count) checked tables. Samples: " + ($sample -join '; ')
    }
    Add-Check 'TABLE_HEADERS' 'Non-fillable multi-row tables use w:tblHeader on their first row.' $(if ($tableHeaderOk) { 'PASS' } else { 'FAIL' }) $headerEvidence
}
else {
    Add-Check 'TABLE_HEADERS' 'Non-fillable multi-row tables use w:tblHeader on their first row.' 'SKIP' 'OOXML table semantics cannot be verified from exported text; run this gate against the final DOCX.'
}

$failed = @($script:Checks | Where-Object { $_.Status -eq 'FAIL' })
$skipped = @($script:Checks | Where-Object { $_.Status -eq 'SKIP' })
$passed = @($script:Checks | Where-Object { $_.Status -eq 'PASS' })

$summary = [pscustomobject]@{
    Path    = $resolvedPath
    Passed  = $passed.Count
    Failed  = $failed.Count
    Skipped = $skipped.Count
    Checks  = $script:Checks
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 5
}
else {
    Write-Output "Rulebook v2.1 verification: $resolvedPath"
    foreach ($check in $script:Checks) {
        Write-Output ("[{0}] {1}: {2}" -f $check.Status, $check.Id, $check.Description)
        if ($check.Status -ne 'PASS' -and $check.Evidence) {
            Write-Output ("       {0}" -f $check.Evidence)
        }
    }
    Write-Output ("Summary: PASS={0} FAIL={1} SKIP={2}" -f $passed.Count, $failed.Count, $skipped.Count)
}

if ($failed.Count -gt 0) {
    exit 1
}
exit 0
