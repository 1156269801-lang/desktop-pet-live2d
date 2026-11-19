# 大肥鱼桌宠 · WPF 启动器
# .NET Framework 4.8 自带 WPF + XamlReader 运行时加载，零额外依赖。
# 后端复用 services.ps1，不改动其语义。

param([switch]$NoStaCheck)

$ErrorActionPreference = 'Stop'

if (-not $NoStaCheck -and [System.Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    $self = $PSCommandPath
    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$self`"", '-NoStaCheck'
    ) | Out-Null
    exit
}

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'services.ps1')

$version = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json

function Img([string]$rel) {
    $p = Join-Path $PSScriptRoot $rel
    if (-not (Test-Path -LiteralPath $p)) { return $null }
    $bi = New-Object System.Windows.Media.Imaging.BitmapImage
    $bi.BeginInit()
    $bi.UriSource = New-Object Uri($p, [UriKind]::Absolute)
    $bi.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    $bi.EndInit(); $bi.Freeze()
    return $bi
}
function Brush([string]$hex) { [System.Windows.Media.BrushConverter]::new().ConvertFromString($hex) }

$cOk = Brush '#0F7A36'; $cWarn = Brush '#B45309'; $cBad = Brush '#DC2626'; $cIdle = Brush '#94A3B8'

# ---------- 加载 XAML ----------
$xamlPath = Join-Path $PSScriptRoot 'ui.xaml'
$rawXaml = Get-Content -LiteralPath $xamlPath -Raw -Encoding UTF8
$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader ([xml]$rawXaml)))

# ---------- 取控件 ----------
$ui = @{}
$names = @(
    'AppTitle','AppVersion','BuildLabel','RuntimeDot','RuntimeText','BtnMin','BtnClose','TitleBar',
    'BrandLogo','SideVersion','NavPanel','PageTitle',
    # 启动
    'PageLaunch','HeroLogo','HeroVersion','BtnLaunch',
    'BarTts','GlowTts','DotTts','PortTts','StateTts',
    'BarAsr','GlowAsr','DotAsr','PortAsr','StateAsr',
    'BarPet','GlowPet','DotPet','PortPet','StatePet',
    'LogFile','LogText','LogScroll',
    # 服务
    'PageServices','SvcBarTts','SvcGlowTts','SvcDotTts','SvcPortTts','SvcStateTts','SvcStartTts','SvcStopTts',
    'SvcBarAsr','SvcGlowAsr','SvcDotAsr','SvcPortAsr','SvcStateAsr','SvcStartAsr','SvcStopAsr',
    'SvcBarPet','SvcGlowPet','SvcDotPet','SvcPortPet','SvcStatePet','SvcStartPet','SvcStopPet',
    'SvcStopAll','SvcRefresh','SvcHint',
    # 设置
    'PageSettings','SetBaseURL','SetModel','SetApiKey','SetPortTts','SetPortAsr','SetSave','SetReset','SetHint',
    # 高级
    'PageAdvanced','AdvPersona','AdvBudgetIn','AdvBudgetOut','AdvDiag','AdvDiagText','AdvSave','AdvReset','AdvHint',
    # 记忆
    'PageMemory','MemSearch','MemCount','MemList','MemAdd','MemEdit','MemDelete','MemImport','MemExport','MemHint',
    # 陪伴
    'PageCompanion','CompEnable','CompInterval','CompStart','CompEnd','CompSave','CompHint',
    # 维护
    'PageMaintenance','MaintDays','MaintClean','MaintCleanHint',
    'MaintBackup','MaintRestore','MaintBackupHint','MaintArchive','MaintArchiveHint',
    # 日志
    'PageLogs','LogsPicker','LogsRefresh','LogsHint','LogsScroll','LogsText',
    # 关于
    'PageAbout','AboutLogo','AboutVersion','AboutLauncher','AboutRoot',
    # 状态栏
    'StatusText','StatusRight','ResizeGrip'
)
foreach ($n in $names) { $ui[$n] = $win.FindName($n) }

$pageMap = @{
    '启动' = $ui.PageLaunch; '服务' = $ui.PageServices; '设置' = $ui.PageSettings
    '高级' = $ui.PageAdvanced; '记忆' = $ui.PageMemory; '陪伴' = $ui.PageCompanion
    '维护' = $ui.PageMaintenance; '日志' = $ui.PageLogs; '关于' = $ui.PageAbout
}

# ---------- 基本信息 ----------
$ui.AppVersion.Text = " v$($version.app)"
$ui.BuildLabel.Text = "Launcher v$($version.launcher)"
$ui.SideVersion.Text = "v$($version.app)"
$ui.HeroVersion.Text = "v$($version.app)"
$ui.AboutVersion.Text = "v$($version.app)"
$ui.AboutLauncher.Text = "v$($version.launcher)"
$ui.AboutRoot.Text = $Root

$lg = Img 'ui\logo-40.png'; if ($lg) { $ui.BrandLogo.Source = $lg }
$lb = Img 'ui\logo-80.png'; if ($lb) { $ui.HeroLogo.Source = $lb; $ui.AboutLogo.Source = $lb }
try { $win.Icon = New-Object System.Windows.Media.Imaging.BitmapImage((New-Object Uri((Join-Path $PSScriptRoot 'launcher.ico')))) } catch { }

# ---------- 窗口 ----------
$ui.BtnMin.Add_Click({ $win.WindowState = 'Minimized' })
$ui.BtnClose.Add_Click({ $win.Close() })
$ui.TitleBar.Add_MouseLeftButtonDown({ try { $win.DragMove() } catch { } })
$ui.ResizeGrip.Add_MouseLeftButtonDown({ try { $win.DragMove() } catch { } })

# ---------- 页面切换 ----------
$navButtons = @{}
function Set-Page([string]$name) {
    $ui.PageTitle.Text = $name
    foreach ($k in $pageMap.Keys) {
        $p = $pageMap[$k]
        if ($p) { $p.Visibility = if ($k -eq $name) { 'Visible' } else { 'Collapsed' } }
        if ($navButtons.ContainsKey($k)) {
            $navButtons[$k].Tag = if ($k -eq $name) { 'active' } else { $null }
        }
    }
    switch ($name) {
        '服务'  { Refresh-Services }
        '设置'  { Load-Settings }
        '高级'  { Load-Advanced }
        '记忆'  { Load-Memory }
        '陪伴'  { Load-Companion }
        '日志'  { Load-Logs }
    }
}

foreach ($name in $pageMap.Keys | Sort-Object @{Expression={ @('启动','服务','设置','高级','记忆','陪伴','维护','日志','关于').IndexOf($_) }}) {
    $b = New-Object System.Windows.Controls.Button
    $b.Content = $name
    $b.Style = $win.Resources['NavItem']
    $b.Add_Click({ param($s, $e) Set-Page $s.Content })
    [void]$ui.NavPanel.Children.Add($b)
    $navButtons[$name] = $b
}

# ---------- 状态 ----------
function Report([string]$text, [switch]$Failed) {
    $ui.StatusText.Text = $text
    if ($Failed) { $ui.StatusText.Text = "⚠ $text" }
}

function Set-Dot($dot, $glow, $bar, $label, [string]$state, [string]$text) {
    $br = switch ($state) { 'ok' { $cOk } 'warn' { $cWarn } 'bad' { $cBad } default { $cIdle } }
    if ($dot)   { $dot.Fill = $br }
    if ($glow)  { $glow.Fill = $br }
    if ($bar)   { $bar.Background = if ($state -eq 'ok') { $br } else { $cIdle } }
    if ($label) { $label.Text = $text; $label.Foreground = $br }
}

function Refresh-Status {
    try {
        $cfg = Read-Config
        $ports = Read-Ports $cfg
        $tts = Test-Tcp $ports.TTS
        $asr = Test-Tcp $ports.ASR
        $pet = Test-Tcp $ports.Pet

        Set-Dot $ui.DotTts $ui.GlowTts $ui.BarTts $ui.StateTts $(if ($tts) { 'ok' } else { 'idle' }) $(if ($tts) { '就绪' } else { '未启动' })
        Set-Dot $ui.DotAsr $ui.GlowAsr $ui.BarAsr $ui.StateAsr $(if ($asr) { 'ok' } else { 'idle' }) $(if ($asr) { '就绪' } else { '未启动' })
        Set-Dot $ui.DotPet $ui.GlowPet $ui.BarPet $ui.StatePet $(if ($pet) { 'ok' } else { 'idle' }) $(if ($pet) { '就绪' } else { '未启动' })
        $ui.PortTts.Text = "端口 $($ports.TTS)"
        $ui.PortAsr.Text = "端口 $($ports.ASR)"
        $ui.PortPet.Text = "端口 $($ports.Pet)"

        $any = $tts -or $asr -or $pet
        $ui.RuntimeText.Text = if ($any) { '运行中就绪' } else { '运行时未启动' }
        $ui.RuntimeDot.Fill = if ($any) { $cOk } else { $cIdle }
        $ui.StatusRight.Text = "TTS $($ports.TTS) · ASR $($ports.ASR) · Pet $($ports.Pet)"
    } catch { Report $_.Exception.Message -Failed }
}

function Refresh-Services {
    try {
        $cfg = Read-Config
        $ports = Read-Ports $cfg
        $map = @(
            @('Tts', $ports.TTS), @('Asr', $ports.ASR), @('Pet', $ports.Pet)
        )
        foreach ($m in $map) {
            $k = $m[0]; $port = $m[1]
            $up = Test-Tcp $port
            Set-Dot $ui["SvcDot$k"] $ui["SvcGlow$k"] $ui["SvcBar$k"] $ui["SvcState$k"] $(if ($up) { 'ok' } else { 'idle' }) $(if ($up) { '就绪' } else { '未启动' })
            $ui["SvcPort$k"].Text = "端口 $port"
            $ui["SvcStart$k"].IsEnabled = -not $up
            $ui["SvcStop$k"].IsEnabled = $true
        }
        $ui.SvcHint.Text = '停止只会结束本启动器拉起的进程'
    } catch { Report $_.Exception.Message -Failed }
}

# ---------- 启动页 ----------
$ui.BtnLaunch.Add_Click({
    try {
        Report '正在启动桌宠…'
        $msg = Start-Component 'Pet'
        Report $(if ($msg) { $msg } else { '已启动' })
        Start-Sleep -Milliseconds 900
        Refresh-Status; Refresh-Logs
    } catch { Report $_.Exception.Message -Failed }
})

# ---------- 服务页 ----------
foreach ($pair in @(@('Tts','TTS'), @('Asr','ASR'), @('Pet','Pet'))) {
    $k = $pair[0]; $real = $pair[1]
    $ui["SvcStart$k"].Add_Click({
        param($s, $e)
        try { Report (Start-Component $real); Start-Sleep -Milliseconds 700; Refresh-Services }
        catch { Report $_.Exception.Message -Failed }
    }.GetNewClosure())
    $ui["SvcStop$k"].Add_Click({
        param($s, $e)
        try { Report (Stop-Component $real); Start-Sleep -Milliseconds 400; Refresh-Services }
        catch { Report $_.Exception.Message -Failed }
    }.GetNewClosure())
}
$ui.SvcStopAll.Add_Click({
    try {
        $msgs = @(); $failed = $false
        foreach ($k in @('Pet','ASR','TTS')) {
            try { $msgs += Stop-Component $k } catch { $msgs += $_.Exception.Message; $failed = $true }
        }
        Report (($msgs | Where-Object { $_ }) -join ' / ') -Failed:$failed
        Refresh-Services
    } catch { Report $_.Exception.Message -Failed }
})
$ui.SvcRefresh.Add_Click({ Refresh-Services })

# ---------- 设置页 ----------
function Load-Settings {
    try {
        $cfg = Read-Config
        $ports = Read-Ports $cfg
        $ui.SetBaseURL.Text = [string]$cfg.llm.baseURL
        $ui.SetModel.Text = [string]$cfg.llm.model
        $ui.SetApiKey.Text = [string]$cfg.llm.apiKey
        $ui.SetPortTts.Text = [string]$ports.TTS
        $ui.SetPortAsr.Text = [string]$ports.ASR
        $ui.SetHint.Text = ''
    } catch { Report $_.Exception.Message -Failed }
}

$ui.SetSave.Add_Click({
    try {
        $cfg = Read-Config
        $cfg.llm.baseURL = $ui.SetBaseURL.Text.Trim()
        $cfg.llm.model = $ui.SetModel.Text.Trim()
        $cfg.llm.apiKey = $ui.SetApiKey.Text.Trim()
        $ttsPort = 0; $asrPort = 0
        if ([int]::TryParse($ui.SetPortTts.Text.Trim(), [ref]$ttsPort)) { }
        if ([int]::TryParse($ui.SetPortAsr.Text.Trim(), [ref]$asrPort)) { }
        if ($ttsPort -gt 0) { $cfg.tts.url = "http://127.0.0.1:$ttsPort/tts" }
        if ($asrPort -gt 0) { $cfg.asr.url = "http://127.0.0.1:$asrPort/v1/audio/transcriptions" }
        $cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigFile -Encoding UTF8
        $ui.SetHint.Text = '已保存'
        Report '设置已保存'
        Refresh-Status
    } catch { Report $_.Exception.Message -Failed }
})

$ui.SetReset.Add_Click({
    try {
        $ui.SetBaseURL.Text = 'https://discovery-api.intern-ai.org.cn/v1'
        $ui.SetModel.Text = 'deepseek-v4-flash-vision'
        $ui.SetApiKey.Text = ''
        $ui.SetPortTts.Text = '9881'
        $ui.SetPortAsr.Text = '8000'
        $ui.SetHint.Text = '已恢复默认值（未保存）'
    } catch { Report $_.Exception.Message -Failed }
})

# ---------- 高级页 ----------
function Load-Advanced {
    try {
        $cfg = Read-Config
        $ui.AdvPersona.Text = [string]$cfg.persona
        if ($cfg.director -and $cfg.director.contextTokens) { $ui.AdvBudgetIn.Text = [string]$cfg.director.contextTokens }
        $ui.AdvHint.Text = ''
    } catch { Report $_.Exception.Message -Failed }
}

$ui.AdvSave.Add_Click({
    try {
        $cfg = Read-Config
        $cfg.persona = $ui.AdvPersona.Text
        $v = 0
        if ([int]::TryParse($ui.AdvBudgetIn.Text.Trim(), [ref]$v) -and $v -gt 0) {
            if (-not $cfg.director) { $cfg.director = [pscustomobject]@{} }
            $cfg.director | Add-Member -NotePropertyName contextTokens -NotePropertyValue $v -Force
        }
        $cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigFile -Encoding UTF8
        $ui.AdvHint.Text = '已保存'
        Report '人设与预算已保存'
    } catch { Report $_.Exception.Message -Failed }
})

$ui.AdvReset.Add_Click({
    $ui.AdvPersona.Text = '你是「大肥鱼」，一只住在用户电脑桌面上的鲸鱼女仆。你话不多但很粘人，喜欢吐槽用户熬夜、催他喝水、对他玩的游戏发表意见。你有点傲娇，偶尔自夸。不要说自己是 AI 或程序，不要长篇大论。'
    $ui.AdvBudgetIn.Text = '32000'; $ui.AdvBudgetOut.Text = '8000'
    $ui.AdvHint.Text = '已恢复默认值（未保存）'
})

$ui.AdvDiag.Add_Click({
    try {
        $cfg = Read-Config
        $ports = Read-Ports $cfg
        $ctl = Test-Tcp $ports.Pet
        $ui.AdvDiagText.Text = if ($ctl) { "控制口 $($ports.Pet) 可达" } else { "控制口 $($ports.Pet) 未监听" }
        $ui.AdvDiagText.Foreground = if ($ctl) { $cOk } else { $cBad }
    } catch { $ui.AdvDiagText.Text = $_.Exception.Message; $ui.AdvDiagText.Foreground = $cBad }
})

# ---------- 记忆页 ----------
$script:memItems = @()
function Load-Memory {
    try {
        $file = Join-Path $Root 'data\memory.json'
        if (-not (Test-Path $file)) {
            $ui.MemHint.Text = '还没有记忆文件（data\memory.json）'
            $ui.MemCount.Text = '0 条'
            $ui.MemList.Items.Clear()
            return
        }
        $data = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
        $script:memItems = @($data)
        Show-Memory $ui.MemSearch.Text
    } catch { Report $_.Exception.Message -Failed }
}
function Show-Memory([string]$filter) {
    $ui.MemList.Items.Clear()
    $kw = if ($filter) { $filter.Trim() } else { '' }
    if ($kw -eq '搜索记忆...') { $kw = '' }
    $shown = 0
    foreach ($it in $script:memItems) {
        $text = [string]$it.text
        if ($kw -and $text -notlike "*$kw*") { continue }
        $it2 = New-Object System.Windows.Controls.ListBoxItem
        $it2.Content = $text
        $it2.Padding = New-Object System.Windows.Thickness(10, 8, 10, 8)
        $it2.FontSize = 12
        $it2.Tag = $it
        [void]$ui.MemList.Items.Add($it2)
        $shown++
    }
    $ui.MemCount.Text = "$shown 条"
}
$ui.MemSearch.Add_TextChanged({ if ($ui.MemSearch.Text -ne '搜索记忆...') { Show-Memory $ui.MemSearch.Text } })
$ui.MemSearch.Add_GotFocus({ if ($ui.MemSearch.Text -eq '搜索记忆...') { $ui.MemSearch.Text = '' } })

# ---------- 陪伴页 ----------
function Load-Companion {
    try {
        $cfg = Read-Config
        $a = $cfg.autonomy
        $ui.CompEnable.IsChecked = [bool]$a.allowAutonomous
        $ui.CompInterval.Text = if ($a.intervalSec) { [string][int]([int]$a.intervalSec / 60) } else { '15' }
        $ui.CompStart.Text = '8'; $ui.CompEnd.Text = '23'
        $ui.CompHint.Text = ''
    } catch { Report $_.Exception.Message -Failed }
}
$ui.CompSave.Add_Click({
    try {
        $cfg = Read-Config
        $cfg.autonomy.allowAutonomous = [bool]$ui.CompEnable.IsChecked
        $v = 0
        if ([int]::TryParse($ui.CompInterval.Text.Trim(), [ref]$v) -and $v -gt 0) { $cfg.autonomy.intervalSec = $v * 60 }
        $cfg | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigFile -Encoding UTF8
        $ui.CompHint.Text = '已保存'
        Report '陪伴配置已保存'
    } catch { Report $_.Exception.Message -Failed }
})

# ---------- 维护页 ----------
$ui.MaintClean.Add_Click({
    try {
        $days = 30
        [void][int]::TryParse($ui.MaintDays.Text.Trim(), [ref]$days)
        $logs = Join-Path $Root 'data\logs'
        if (-not (Test-Path $logs)) { $ui.MaintCleanHint.Text = '没有日志目录'; return }
        $cut = (Get-Date).AddDays(-$days)
        $old = Get-ChildItem $logs -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cut }
        $n = @($old).Count
        foreach ($f in $old) { Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue }
        $ui.MaintCleanHint.Text = "清理了 $n 个文件"
        Report "清理完成：$n 个文件"
    } catch { Report $_.Exception.Message -Failed }
})

$ui.MaintBackup.Add_Click({
    try {
        $dst = Join-Path $Root "data\backup\config-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
        New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
        Copy-Item $ConfigFile $dst -Force
        $ui.MaintBackupHint.Text = "已备份到 $(Split-Path $dst -Leaf)"
        Report '配置已备份'
    } catch { Report $_.Exception.Message -Failed }
})

$ui.MaintRestore.Add_Click({
    try {
        $dir = Join-Path $Root 'data\backup'
        if (-not (Test-Path $dir)) { $ui.MaintBackupHint.Text = '没有备份'; return }
        $latest = Get-ChildItem $dir -Filter *.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $latest) { $ui.MaintBackupHint.Text = '没有备份'; return }
        Copy-Item $latest.FullName $ConfigFile -Force
        $ui.MaintBackupHint.Text = "已恢复 $(latest.Name)"
        Report '配置已恢复'
    } catch { Report $_.Exception.Message -Failed }
})

$ui.MaintArchive.Add_Click({
    try {
        $logs = Join-Path $Root 'data\logs'
        if (-not (Test-Path $logs)) { $ui.MaintArchiveHint.Text = '没有日志目录'; return }
        $zip = Join-Path $Root "data\archive-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
        Compress-Archive -Path (Join-Path $logs '*') -DestinationPath $zip -Force -ErrorAction Stop
        $ui.MaintArchiveHint.Text = "已归档 $(Split-Path $zip -Leaf)"
        Report '日志已归档'
    } catch { $ui.MaintArchiveHint.Text = $_.Exception.Message }
})

# ---------- 日志页 ----------
function Load-Logs {
    try {
        $dir = Join-Path $Root 'data\logs'
        $ui.LogsPicker.Items.Clear()
        if (-not (Test-Path $dir)) { $ui.LogsHint.Text = '没有日志目录'; $ui.LogsText.Text = ''; return }
        $files = Get-ChildItem $dir -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        foreach ($f in $files) { [void]$ui.LogsPicker.Items.Add($f.Name) }
        if ($ui.LogsPicker.Items.Count -gt 0) {
            $ui.LogsPicker.SelectedIndex = 0
            $ui.LogsHint.Text = "$($ui.LogsPicker.Items.Count) 个文件"
        } else { $ui.LogsHint.Text = '没有日志文件'; $ui.LogsText.Text = '' }
    } catch { Report $_.Exception.Message -Failed }
}
$ui.LogsPicker.Add_SelectionChanged({
    try {
        if (-not $ui.LogsPicker.SelectedItem) { return }
        $p = Join-Path (Join-Path $Root 'data\logs') $ui.LogsPicker.SelectedItem
        $ui.LogsText.Text = Get-Content -LiteralPath $p -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        $ui.LogsScroll.ScrollToEnd()
    } catch { $ui.LogsText.Text = $_.Exception.Message }
})
$ui.LogsRefresh.Add_Click({ Load-Logs })

# ---------- 启动页日志 ----------
function Refresh-Logs {
    try {
        $dir = Join-Path $Root 'data\logs'
        if (-not (Test-Path $dir)) { $ui.LogText.Text = '暂无日志目录'; return }
        $latest = Get-ChildItem $dir -Filter *.log -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $latest) { $ui.LogText.Text = '暂无日志文件'; return }
        $ui.LogFile.Text = $latest.Name
        $tail = Get-Content -LiteralPath $latest.FullName -Tail 8 -Encoding UTF8 -ErrorAction SilentlyContinue
        $ui.LogText.Text = if ($tail) { $tail -join "`r`n" } else { '（日志为空）' }
        $ui.LogScroll.ScrollToEnd()
    } catch { $ui.LogText.Text = "读取日志失败：$($_.Exception.Message)" }
}

# ---------- 定时器 ----------
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromSeconds(3)
$timer.Add_Tick({ Refresh-Status; Refresh-Logs })
$timer.Start()

$win.Add_Loaded({
    Set-Page '启动'
    Refresh-Status
    Refresh-Logs
})

[void]$win.ShowDialog()
