param([switch]$SmokeTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
. (Join-Path $PSScriptRoot 'services.ps1')

function Color([string]$Hex) { [Drawing.ColorTranslator]::FromHtml($Hex) }

# ===== 主题切换 =====
$Theme = 'Light'   # 'Light' | 'Dark'

switch ($Theme) {
  'Light' {
    $bg = Color '#F4F7FA'; $surface = Color '#FFFFFF'; $surface2 = Color '#EEF3F8'
    $sidebar = Color '#2B3440'; $sidebarHi = Color '#353F4D'; $sidebarTx = Color '#E8EEF5'; $sidebarMu = Color '#9AA9BA'
    $text = Color '#16243A'; $muted = Color '#5A6B80'; $faint = Color '#65758A'
    $accent = Color '#1A63C4'; $accentHi = Color '#1E6FD9'; $accentLo = Color '#175AAE'; $accentFg = Color '#FFFFFF'
    $ok = Color '#0F7A36'; $warn = Color '#B45309'; $bad = Color '#DC2626'; $idle = Color '#94A3B8'
    $border = Color '#D8E2EC'; $borderHi = Color '#C3D2E0'; $lineSoft = Color '#E8EFF6'
    $cardHighlight = Color '#FFFFFF'; $highlightAlpha = 153   # 60%
  }
  'Dark' {
    $bg = Color '#0B1420'; $surface = Color '#14202E'; $surface2 = Color '#1B2A3A'
    $sidebar = Color '#0E1927'; $sidebarHi = Color '#16232F'; $sidebarTx = Color '#E8F1FA'; $sidebarMu = Color '#7C92A8'
    $text = Color '#E8F1FA'; $muted = Color '#93A9BF'; $faint = Color '#6B8199'
    $accent = Color '#3B9EFF'; $accentHi = Color '#5CB0FF'; $accentLo = Color '#2A85E0'; $accentFg = Color '#08121C'
    $ok = Color '#4ADE80'; $warn = Color '#FBBF24'; $bad = Color '#F87171'; $idle = Color '#54687C'
    $border = Color '#24384C'; $borderHi = Color '#2F4861'; $lineSoft = Color '#1A2B3C'
    $cardHighlight = Color '#FFFFFF'; $highlightAlpha = 20    # 8%
  }
}

# 向后兼容别名
$white = $text; $green = $ok; $yellow = $warn; $red = $bad
$card = $surface; $cardHover = $surface2; $accentDown = $accentLo; $logBg = $bg
# ---- Win11 圆角 / Mica（DWM）----
if (-not ('PetDwm' -as [type])) {
    Add-Type -TypeDefinition 'using System;
using System.Runtime.InteropServices;
public class PetDwm {
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
    [DllImport("dwmapi.dll")] public static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref M m);
    [StructLayout(LayoutKind.Sequential)] public struct M { public int l, r, t, b; }
    public static int Round(IntPtr h) { int v = 2; return DwmSetWindowAttribute(h, 33, ref v, 4); }
    public static int Backdrop(IntPtr h, int kind) { int v = kind; int hr = DwmSetWindowAttribute(h, 38, ref v, 4);
        var m = new M { l = -1, r = -1, t = -1, b = -1 }; DwmExtendFrameIntoClientArea(h, ref m); return hr; }
}' -ErrorAction SilentlyContinue
}
# ---- 无边框窗体圆角：DWM 圆角对 FormBorderStyle=None 无效，用 SetWindowRgn 手工裁 ----
if (-not ('PetRound' -as [type])) {
    $sig = '[DllImport("gdi32.dll")] public static extern IntPtr CreateRoundRectRgn(int l,int t,int r,int b,int w,int h); [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h, IntPtr r, bool redraw); public static void Apply(IntPtr h, int w, int ht, int radius) { IntPtr rgn = CreateRoundRectRgn(0, 0, w + 1, ht + 1, radius * 2, radius * 2); SetWindowRgn(h, rgn, true); }'
    Add-Type -MemberDefinition $sig -Name PetRound -PassThru -ErrorAction SilentlyContinue | Out-Null
}
$form = New-Object Windows.Forms.Form
$form.Text = '大肥鱼桌宠 · 启动器'
$form.Size = New-Object Drawing.Size(980,620)
$form.MinimumSize = New-Object Drawing.Size(820,520)
$form.FormBorderStyle = 'None'; $form.StartPosition = 'CenterScreen'; $form.BackColor = $bg
$form.Padding = New-Object Windows.Forms.Padding(1)
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI',10)
$iconPath = Join-Path $PSScriptRoot 'launcher.ico'
if (Test-Path -LiteralPath $iconPath) { $form.Icon = New-Object Drawing.Icon($iconPath) }

$form.Add_HandleCreated({
    try { [void][PetDwm]::Round($form.Handle) } catch { }
    try { [PetRound]::Apply($form.Handle, $form.Width, $form.Height, 12) } catch { }
})
# 缩放时重新裁剪，否则圆角会消失
$form.Add_Resize({
    try { [PetRound]::Apply($form.Handle, $form.Width, $form.Height, 12) } catch { }
})
function Set-Round($Panel,[int]$Corner=12) {
    if ($Panel.Width -lt 24 -or $Panel.Height -lt 24) { return }
    $shape = New-Object Drawing.Drawing2D.GraphicsPath; $radius = $Corner*2
    try {
        $shape.AddArc(0,0,$radius,$radius,180,90)
        $shape.AddArc($Panel.Width-$radius,0,$radius,$radius,270,90)
        $shape.AddArc($Panel.Width-$radius,$Panel.Height-$radius,$radius,$radius,0,90)
        $shape.AddArc(0,$Panel.Height-$radius,$radius,$radius,90,90)
        $shape.CloseFigure()
        $old = $Panel.Region; $Panel.Region = New-Object Drawing.Region($shape)
        if ($old) { $old.Dispose() }
    } finally { $shape.Dispose() }
}

function Round-Box($Control,[int]$Pad=5,[int]$Corner=8) {
    # 给无边框输入控件垫一层圆角色块，位置不变，只在下面加视觉圆角
    try {
        $parent = $Control.Parent
        if (-not $parent) { return }
        $b = $Control.Bounds
        $holder = New-Object Windows.Forms.Panel
        $holder.BackColor = $surface2
        $parent.Controls.Add($holder)
        $holder.SetBounds($b.X - $Pad, $b.Y - $Pad, $b.Width + $Pad * 2, $b.Height + $Pad * 2)
        [void]$holder.GetType().InvokeMember('DoubleBuffered',
            [Reflection.BindingFlags]::SetProperty -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic,
            $null, $holder, $true)
        Set-Round $holder $Corner
        $Control.BorderStyle = 'None'
        $Control.BackColor = $surface2
        $Control.BringToFront()
    } catch { }
}
function Dot($Parent,[int]$X,[int]$Y,[int]$W,[int]$H) {
    $pic = New-Object Windows.Forms.PictureBox
    $pic.SizeMode = 'Zoom'; $pic.BackColor = [Drawing.Color]::Transparent
    [void](Place $Parent $pic $X $Y $W $H)
    Set-Dot $pic 'idle'
    return $pic
}
function Set-Dot($Pic,$State) {
    # 兼容传颜色进来：映射成状态名
    if ($State -is [Drawing.Color]) {
        $name = 'idle'
        if ($State -eq $ok) { $name = 'ok' }
        elseif ($State -eq $warn) { $name = 'warn' }
        elseif ($State -eq $bad) { $name = 'bad' }
        $State = $name
    }
    if (-not $State) { $State = 'idle' }
    $path = Join-Path $PSScriptRoot ("ui\dot-" + $State + ".png")
    if (-not (Test-Path -LiteralPath $path)) { return }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $ms = New-Object System.IO.MemoryStream(,$bytes)
        $img = [Drawing.Image]::FromStream($ms)
        $old = $Pic.Image; $Pic.Image = $img
        if ($old) { $old.Dispose() }
    } catch { }
}
function Place($Parent,$Control,[int]$X,[int]$Y,[int]$W,[int]$H) {
    $Control.SetBounds($X,$Y,$W,$H)
    $Parent.Controls.Add($Control)
    return $Control
}
function Label($Parent,[string]$Caption,[int]$X,[int]$Y,[int]$W,[int]$H,[int]$Size=10,$Ink=$null,[switch]$Bold) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $Caption
    $label.ForeColor = if ($null -eq $Ink) { $text } else { $Ink }
    $style = if ($Bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $label.Font = [Drawing.Font]::new('Microsoft YaHei UI',$Size,$style); $label.UseMnemonic=$false
    $label.TextAlign = 'MiddleLeft'; $label.AutoEllipsis = $true
    Place $Parent $label $X $Y $W $H
}
function Feedback($Control,$Fill,$Over,$Down) {
    $Control.BackColor=$Fill
    $Control.Add_MouseEnter({param($sender,$eventArgs) if($sender.Enabled){$sender.BackColor=$Over}}.GetNewClosure())
    $Control.Add_MouseLeave({param($sender,$eventArgs) $sender.BackColor=$Fill}.GetNewClosure())
    $Control.Add_MouseDown({param($sender,$eventArgs) if($sender.Enabled -and $eventArgs.Button -eq 'Left'){$sender.BackColor=$Down}}.GetNewClosure())
    $Control.Add_MouseUp({param($sender,$eventArgs) if($sender.Enabled){$sender.BackColor=$Over}}.GetNewClosure())
}
function Button-Skin($Control,$Fill) {
    $over=if ($Fill -eq $accent) {$accentHi} else {$sidebarHi}
    $down=if ($Fill -eq $accent) {$accentLo} else {$sidebar}
    $Control.Tag.Fill=$Fill; $Control.Tag.Over=$over; $Control.Tag.Down=$down
    $Control.BackColor=$Fill
    $Control.FlatAppearance.MouseOverBackColor=$over; $Control.FlatAppearance.MouseDownBackColor=$down
}
function Button($Parent,[string]$Text,[int]$X,[int]$Y,[int]$W,[int]$H,$Fill=$card,$Outline=$null,[switch]$Rounded) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $Text; $button.FlatStyle = 'Flat'; $button.FlatAppearance.BorderSize = 0
    $button.Tag=@{Key=$null;Fill=$Fill;Over=$Fill;Down=$Fill}; Button-Skin $button $Fill
    $button.ForeColor=if($Fill -eq $accent){$logBg}else{$white}; $button.UseVisualStyleBackColor = $false
    if($null -ne $Outline){$button.FlatAppearance.BorderSize=1; $button.FlatAppearance.BorderColor=$Outline; $button.ForeColor=$Outline}
    # hover / active 状态标记，供内阴影绘制使用
    $button.Add_MouseEnter({param($sender,$eventArgs) if($sender.Enabled){$sender.Tag.Hover=$true; $sender.BackColor=$sender.Tag.Over; $sender.Invalidate()}})
    $button.Add_MouseLeave({param($sender,$eventArgs) $sender.Tag.Hover=$false; $sender.Tag.Active=$false; $sender.BackColor=$sender.Tag.Fill; $sender.Invalidate()})
    # 内阴影：hover 时顶部 1px 高光 + 底部 1px 暗线，按下时反转为内凹
    $button.Add_Paint({param($sender,$eventArgs)
        if (-not $sender.Tag.Hover) { return }
        $g = $eventArgs.Graphics; $g.SmoothingMode = 'AntiAlias'
        $w = $sender.Width; $h = $sender.Height
        if ($sender.Tag.Active) {
            $top = [Drawing.Pen]::new([Drawing.Color]::FromArgb(70, 0, 0, 0), 1)
            $bot = [Drawing.Pen]::new([Drawing.Color]::FromArgb(28, 255, 255, 255), 1)
        } else {
            $top = [Drawing.Pen]::new([Drawing.Color]::FromArgb(60, 255, 255, 255), 1)
            $bot = [Drawing.Pen]::new([Drawing.Color]::FromArgb(48, 0, 0, 0), 1)
        }
        try {
            $g.DrawLine($top, 10, 1, $w - 11, 1)
            $g.DrawLine($bot, 10, $h - 2, $w - 11, $h - 2)
        } finally { $top.Dispose(); $bot.Dispose() }
    })
    $button.Add_MouseDown({param($sender,$eventArgs) if($sender.Enabled -and $eventArgs.Button -eq 'Left'){$sender.Tag.Active=$true; $sender.BackColor=$sender.Tag.Down; $sender.Invalidate()}})
    $button.Add_MouseUp({param($sender,$eventArgs) if($sender.Enabled){$sender.BackColor=$sender.Tag.Over}})
    $button.Cursor = [Windows.Forms.Cursors]::Hand
    $button=Place $Parent $button $X $Y $W $H
    if($Rounded){
        Set-Round $button 8
        # FlatAppearance 的边框是矩形，被 Region 裁完四角会剩直角，改自绘圆角边框
        if($null -ne $Outline){
            $button.FlatAppearance.BorderSize = 0
            $edge = $Outline
            $button.Add_Paint({param($sender,$eventArgs)
                $g = $eventArgs.Graphics; $g.SmoothingMode = 'AntiAlias'
                $pen = [Drawing.Pen]::new($edge, 1)
                $path = New-Object Drawing.Drawing2D.GraphicsPath
                $r = 16
                $w = $sender.Width - 1; $h = $sender.Height - 1
                try {
                    $path.AddArc(0, 0, $r, $r, 180, 90)
                    $path.AddArc($w - $r, 0, $r, $r, 270, 90)
                    $path.AddArc($w - $r, $h - $r, $r, $r, 0, 90)
                    $path.AddArc(0, $h - $r, $r, $r, 90, 90)
                    $path.CloseFigure()
                    $g.DrawPath($pen, $path)
                } finally { $pen.Dispose(); $path.Dispose() }
            }.GetNewClosure())
        }
    }
    return $button
}
function Logo($Parent,[int]$Left,[int]$Top,[int]$Size) {
    $logo=Place $Parent (New-Object Windows.Forms.PictureBox) $Left $Top $Size $Size
    $logo.SizeMode='Zoom'; $logo.BackColor=$surface
    Set-Round $logo
    # 优先 ui/logo-{Size}.png（与 launcher.ico 同源，按档位预渲染）
    $uiLogo = Join-Path $PSScriptRoot ("ui\logo-" + $Size + ".png")
    if (-not (Test-Path -LiteralPath $uiLogo)) { $uiLogo = Join-Path $PSScriptRoot 'ui\logo-128.png' }
    $loaded = $false
    if (Test-Path -LiteralPath $uiLogo) {
        try { $logo.Image = [Drawing.Image]::FromFile($uiLogo); $loaded = $true } catch { }
    }
    if (-not $loaded) {
        # 兜底：角色目录里的 icon.png
        $iconPath = Join-Path $Root 'app\characters\DeepSeek免费公皮\icon.png'
        if (Test-Path -LiteralPath $iconPath) {
            try { $logo.Image = [Drawing.Image]::FromFile($iconPath); $loaded = $true } catch { }
        }
    }
    if (-not $loaded) {
        # 最后兜底：渐变圆，不再用 emoji（WinForms 里会变豆腐块）
        $logo.Add_Paint({param($sender,$eventArgs)
            $graphics=$eventArgs.Graphics; $graphics.SmoothingMode='AntiAlias'
            $rect = [Drawing.Rectangle]::new(4, 4, $sender.Width - 8, $sender.Height - 8)
            $brush = [Drawing.Drawing2D.LinearGradientBrush]::new($rect, $accent, $accentHi, 45)
            try { $graphics.FillEllipse($brush, $rect) } finally { $brush.Dispose() }
        })
    }
    return $logo
}
function Card($Parent,[int]$X,[int]$Y,[int]$W,[int]$H) {
    $panel = New-Object Windows.Forms.Panel; $panel.BackColor = $surface
    $panel = Place $Parent $panel $X $Y $W $H
    $panel.Anchor = 'Top,Left'
    # 开启双缓冲
    # InvokeMember 设属性会返回 $true，必须用 [void] 吞掉，否则 Card 会返回数组
    [void]$panel.GetType().InvokeMember('DoubleBuffered',
        [Reflection.BindingFlags]::SetProperty -bor [Reflection.BindingFlags]::Instance -bor [Reflection.BindingFlags]::NonPublic,
        $null, $panel, $true)
    $panel.Add_SizeChanged({ param($sender,$eventArgs) Set-Round $sender })
    Set-Round $panel
    # 添加描边和顶部高光
    $panel.Add_Paint({param($sender,$eventArgs)
        $graphics = $eventArgs.Graphics
        $graphics.SmoothingMode = 'AntiAlias'
        # 描边
        if ($Theme -eq 'Light') {
            $pen = [Drawing.Pen]::new($border, 1)
            $rect = [Drawing.Rectangle]::new(0, 0, $sender.Width - 1, $sender.Height - 1)
            $path = New-Object Drawing.Drawing2D.GraphicsPath
            $radius = 20
            try {
                $path.AddArc(0, 0, $radius, $radius, 180, 90)
                $path.AddArc($rect.Width - $radius, 0, $radius, $radius, 270, 90)
                $path.AddArc($rect.Width - $radius, $rect.Height - $radius, $radius, $radius, 0, 90)
                $path.AddArc(0, $rect.Height - $radius, $radius, $radius, 90, 90)
                $path.CloseFigure()
                $graphics.DrawPath($pen, $path)
            } finally { $pen.Dispose(); $path.Dispose() }
        }
        # 顶部高光
        $highlightColor = [Drawing.Color]::FromArgb($highlightAlpha, $cardHighlight)
        $highlightPen = [Drawing.Pen]::new($highlightColor, 1)
        try {
            $graphics.DrawLine($highlightPen, 10, 1, $sender.Width - 10, 1)
        } finally { $highlightPen.Dispose() }
    })
    return $panel
}

$titlebar = Place $form (New-Object Windows.Forms.Panel) 1 1 978 64
$titlebar.BackColor = $sidebar
$version = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'version.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$heading = Label $titlebar "大肥鱼桌宠 v$($version.app)" 20 8 300 47 18 $sidebarTx
$buildLabel = Label $titlebar ("Launcher v" + $version.launcher) 340 16 150 32 10 $sidebarMu
$runtimeLabel = Label $titlebar '● 运行时检测中' 504 16 200 32 10 $sidebarMu
$minimize = Button $titlebar '—' 880 8 40 42 $sidebar
$minimize.ForeColor = $sidebarTx; $minimize.Font = [Drawing.Font]::new('Microsoft YaHei UI', 14, [Drawing.FontStyle]::Bold)
$close = Button $titlebar '×' 928 8 40 42 $sidebar
$close.ForeColor = $sidebarTx; $close.Font = [Drawing.Font]::new('Microsoft YaHei UI', 16, [Drawing.FontStyle]::Bold)
$minimize.Add_Click({ $form.WindowState = 'Minimized' }); $close.Add_Click({ $form.Close() })
$script:DragFrom = $null
foreach ($control in @($titlebar,$heading,$buildLabel,$runtimeLabel)) {
    $control.Add_MouseDown({param($sender,$eventArgs) if($eventArgs.Button -eq 'Left'){ $script:DragFrom = [Windows.Forms.Cursor]::Position; $script:DragWindow = $form.Location; $sender.Capture = $true }})
    $control.Add_MouseMove({if($script:DragFrom){$point=[Windows.Forms.Cursor]::Position; $form.Location = New-Object Drawing.Point(($script:DragWindow.X+$point.X-$script:DragFrom.X),($script:DragWindow.Y+$point.Y-$script:DragFrom.Y))}})
    $control.Add_MouseUp({$script:DragFrom = $null})
}

$nav = Place $form (New-Object Windows.Forms.Panel) 1 65 200 554
$nav.BackColor = $sidebar
$navLogo=Logo $nav 16 19 40; $navLogo.BackColor=$sidebar
$null=Label $nav '大肥鱼桌宠' 64 15 110 24 10 $sidebarTx -Bold
$null=Label $nav "v$($version.app)" 64 38 110 20 9 $sidebarMu
$body = Place $form (New-Object Windows.Forms.Panel) 210 78 754 488
$status = Label $form '就绪' 207 569 731 38 10 $muted
$status.AccessibleName = '操作状态'
$grip = Label $form '◢' 956 596 23 23 12 $muted
$grip.Cursor = [Windows.Forms.Cursors]::SizeNWSE
Feedback $grip $bg $cardHover $surface
$script:ResizeFrom = $null
$grip.Add_MouseDown({param($sender,$eventArgs) if($eventArgs.Button -eq 'Left'){ $script:ResizeFrom = [Windows.Forms.Cursor]::Position; $script:ResizeSize = $form.Size; $sender.Capture = $true }})
$grip.Add_MouseMove({if($script:ResizeFrom){$point=[Windows.Forms.Cursor]::Position; $form.Size=New-Object Drawing.Size(([Math]::Max(820,$script:ResizeSize.Width+$point.X-$script:ResizeFrom.X)),([Math]::Max(520,$script:ResizeSize.Height+$point.Y-$script:ResizeFrom.Y)))}})
$grip.Add_MouseUp({$script:ResizeFrom = $null})

$pages=@{}; $navButtons=@{}; $content=@{}; $index=0
foreach ($name in @('启动','服务','设置','高级','记忆','陪伴','维护','日志','关于')) {
    $panel = New-Object Windows.Forms.Panel; $panel.Dock = 'Fill'; $panel.Visible = $false
    $body.Controls.Add($panel); $pages[$name] = $panel
    $content[$name]=Place $panel (New-Object Windows.Forms.Panel) 24 20 752 500
    $button = Button $nav $name 12 (76+$index*48) 156 40 $nav.BackColor -Rounded
    $button.Tag.Key=$name; $button.Add_Click({param($sender,$eventArgs) Show-Page $sender.Tag.Key}); $navButtons[$name]=$button; $index++
}
function Report([string]$Text,[switch]$Failed) {
    $status.Text = $Text; $status.ForeColor = if ($Failed) { $bad } else { $muted }
    if ($Failed -and $SmokeTest) { $script:SmokeFailure = $Text }
}
function Act([scriptblock]$Action) {
    try { & $Action } catch { Report $_.Exception.Message -Failed }
}
function Show-Page([string]$Name) {
    foreach ($key in $pages.Keys) {
        $pages[$key].Visible=$key -eq $Name; $button=$navButtons[$key]
        if($key -eq $Name){Button-Skin $button $accent; $button.ForeColor=$accentFg}
        else{Button-Skin $button $sidebar; $button.ForeColor=$sidebarTx}
    }
    $pages[$Name].BringToFront(); $script:PageName = $Name
    if ($Name -eq '日志') { Act { Refresh-Logs } }
    if ($Name -eq '服务') { Act { Refresh-ServiceLogs } }
    if ($Name -eq '启动') { Act { Refresh-Recent } }
}

$script:ServiceLogBuffer = New-Object 'System.Collections.Generic.Queue[string]'
function Refresh-ServiceLogs {
    $filter = [string]$serviceLogFilter.SelectedItem
    $logNames = @{
        '全部' = @('*.log')
        'TTS' = @('tts*.log','gpt-sovits*.log')
        'ASR' = @('asr*.log','sensevoice*.log')
        '桌宠' = @('electron*.log','pet*.log','main*.log')
    }
    $patterns = if ($logNames.ContainsKey($filter)) { $logNames[$filter] } else { @('*.log') }

    $allLines = @()
    foreach ($pattern in $patterns) {
        $files = Get-ChildItem -LiteralPath $LogDir -Filter $pattern -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3
        foreach ($file in $files) {
            $lines = Get-Content -LiteralPath $file.FullName -Tail 10 -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line.Trim()) { $allLines += $line }
            }
        }
    }

    $recent = $allLines | Select-Object -Last 5
    for ($i = 0; $i -lt 5; $i++) {
        $serviceLogLines[$i].Text = if ($i -lt $recent.Count) { $recent[$i] } else { '' }
    }
}

$launchPage=$content['启动']
$null=Label $launchPage '启动' 0 0 180 36 20 -Bold
$stopAll=Button $launchPage '停止全部' 0 0 112 36 $surface2 $bad
$launchCard=Card $launchPage 0 52 752 128
$null=Logo $launchCard 24 24 80
$null=Label $launchCard '大肥鱼桌宠' 120 20 280 32 16 -Bold
$null=Label $launchCard "v$($version.app)" 120 54 168 22 10 $accent
$intro=Label $launchCard 'DeepSeek 鲸鱼娘 · Live2D 桌面宠物' 120 78 320 26 10 $muted
$launch=Button $launchCard '▶  启动桌宠' 0 32 188 64 $accent -Rounded
$launch.AccessibleName='启动桌宠'; $launch.Font=[Drawing.Font]::new('Microsoft YaHei UI',13,[Drawing.FontStyle]::Bold)
$quick=@{}; $shortNames=@{TTS='TTS';ASR='ASR';Pet='桌宠'}
foreach($key in 'TTS','ASR','Pet') {
    $tile=Card $launchPage 0 196 224 104
    $bar=Place $tile (New-Object Windows.Forms.Panel) 0 16 4 72
    $bar.BackColor=$accent; $bar.Visible=$false
    $dot=Dot $tile 20 18 20 24
    $null=Label $tile $shortNames[$key] 44 16 160 30 13 -Bold
    $portLabel=Label $tile '' 20 50 180 20 9 $muted
    $stateLabel=Label $tile '等待检测' 20 72 180 22 9 $muted
    $quick[$key]=@{Card=$tile;Bar=$bar;Dot=$dot;Port=$portLabel;State=$stateLabel}
}
$recent=Card $launchPage 0 316 752 148
$null=Label $recent '最近日志' 20 8 140 28 13 -Bold
$recentFile=Label $recent '' 150 8 470 24 9 $muted
$recentLines=@(0..2 | ForEach-Object {
    $entry=Label $recent '' 20 (38+$_*20) 690 20 9 $muted
    $entry.Font=[Drawing.Font]::new('Consolas',9)
    $entry
})
function Refresh-Recent {
    $latest=Get-ChildItem -LiteralPath $LogDir -File -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $recentFile.Text=if($latest){$latest.Name}else{''}
    $lines=@(if($latest){Get-Content -LiteralPath $latest.FullName -Tail 3 -Encoding UTF8}else{'暂无日志。'})
    if(!$lines.Count){$lines=@('日志文件为空。')}
    for($index=0;$index -lt 3;$index++){$recentLines[$index].Text=if($index -lt $lines.Count){$lines[$index]}else{''}}
}
$launch.Add_Click({ Act {
    $messages = @(); $failed = $false
    foreach ($key in @('TTS','ASR','Pet')) {
        try { $messages += Start-Component $key } catch { $messages += $_.Exception.Message; $failed = $true }
    }
    Report ($messages -join '　') -Failed:$failed; Refresh-Status
} })
$stopAll.Add_Click({ Act {
    $messages = @(); $failed = $false
    foreach ($key in @('Pet','ASR','TTS')) {
        try { $messages += Stop-Component $key } catch { $messages += $_.Exception.Message; $failed = $true }
    }
    Report ($messages -join '　') -Failed:$failed; Refresh-Status
} })

$servicePage=$content['服务']; $null=Label $servicePage '服务管理' 0 0 200 36 20 -Bold
$serviceHelp=Label $servicePage '一键启动/停止 ASR、TTS 和桌宠进程' 210 8 450 24 9 $muted
$serviceLabels=@{}; $servicePorts=@{}; $serviceCards=@{}; $serviceButtons=@{}
$serviceNames=@{TTS='TTS · GPT-SoVITS'; ASR='ASR · SenseVoice'; Pet='桌宠 · Electron'}
$index=0
foreach($key in 'TTS','ASR','Pet') {
    $panel=Card $servicePage 0 (52+$index*130) 752 110; $serviceCards[$key]=$panel
    $statusDot=Dot $panel 20 20 24 28
    $null=Label $panel $serviceNames[$key] 50 18 330 28 13 -Bold
    $servicePorts[$key]=Label $panel '' 50 48 330 20 9 $muted
    $serviceLabels[$key]=Label $panel '等待检测' 50 70 330 22 10 $muted
    $start=Button $panel '启动' 0 20 88 32 $accent $null -Rounded
    $stop=Button $panel '停止' 0 58 88 32 $surface2 $bad -Rounded
    $config=Button $panel '配置' 0 20 88 32 $surface2 $border -Rounded
    $start.Tag.Key=$key; $start.Tag.Dot=$statusDot
    $stop.Tag.Key=$key; $stop.Tag.Dot=$statusDot
    $config.Tag.Key=$key
    $start.Add_Click({param($sender,$eventArgs) Act {
        Report (Start-Component $sender.Tag.Key); Refresh-Status
        Set-Dot $sender.Tag.Dot $ok
    }})
    $stop.Add_Click({param($sender,$eventArgs) Act {
        Report (Stop-Component $sender.Tag.Key); Refresh-Status
        Set-Dot $sender.Tag.Dot $faint
    }})
    $config.Add_Click({param($sender,$eventArgs) Act {
        $key=$sender.Tag.Key
        $configFiles=@{
            TTS="$WorkDir\gpt-sovits\GPT_SoVITS\configs\tts_infer.yaml"
            ASR="$WorkDir\sensevoice\funasr\runtime\python\onnx\server_config.yaml"
            Pet="$WorkDir\pet\config.json"
        }
        if($configFiles.ContainsKey($key) -and (Test-Path $configFiles[$key])){
            Start-Process notepad.exe $configFiles[$key]
        }else{
            Report "暂无 $key 配置文件"
        }
    }})
    $serviceButtons[$key]=@{Start=$start;Stop=$stop;Config=$config;Dot=$statusDot}; $index++
}

$serviceLogCard=Card $servicePage 0 444 752 120
$null=Label $serviceLogCard '实时日志' 20 12 140 28 11 -Bold
$serviceLogFilter=Place $serviceLogCard (New-Object Windows.Forms.ComboBox) 170 10 140 30
$serviceLogFilter.DropDownStyle='DropDownList'; $serviceLogFilter.ForeColor=$text; $serviceLogFilter.FlatStyle='Flat'
$serviceLogFilter.Items.AddRange(@('全部','TTS','ASR','桌宠'))
$serviceLogFilter.SelectedIndex=0
Feedback $serviceLogFilter $surface2 $border $surface
$serviceLogLines=@(0..4 | ForEach-Object {
    $line=Label $serviceLogCard '' 20 (48+$_*14) 710 14 8 $muted
    $line.Font=[Drawing.Font]::new('Consolas',8)
    $line
})

$settingsPage=$content['设置']; $null=Label $settingsPage '设置' 0 0 180 36 20 -Bold
$settingsCard=Card $settingsPage 0 48 752 310
$settingsRules=@(); $settingsInputs=@{}; $settingsFields=@{}
function Group-Title([string]$Name,[int]$Top) {
    $first=Place $settingsCard (New-Object Windows.Forms.Panel) 20 $Top 712 1; $first.BackColor=$lineSoft
    $null=Label $settingsCard $Name 20 ($Top+1) 100 22 9 $muted
    $last=Place $settingsCard (New-Object Windows.Forms.Panel) 20 ($Top+23) 712 1; $last.BackColor=$lineSoft
    $first; $last
}
function Input-Field([string]$Key,[string]$Caption,[int]$Top) {
    $null=Label $settingsCard $Caption 20 $Top 120 30 10 $muted
    $shell=Place $settingsCard (New-Object Windows.Forms.Panel) 148 $Top 584 30
    $shell.BackColor=$surface
    $line=Place $shell (New-Object Windows.Forms.Panel) 0 29 584 1; $line.BackColor=$faint
    $box=New-Object Windows.Forms.TextBox; $box.ForeColor=$text; $box.BorderStyle='None'
    $box.UseSystemPasswordChar=$Key -eq 'apiKey'; $box.AccessibleName=$Caption
    $box=Place $shell $box 8 5 568 20; $box.Tag=$line
    Feedback $box $surface2 $border $surface
    $box.Add_Enter({param($sender,$eventArgs) $sender.Tag.BackColor=$accent})
    $box.Add_Leave({param($sender,$eventArgs) $sender.Tag.BackColor=$faint})
    $settingsInputs[$Key]=$shell; $settingsFields[$Key]=$box
}
$settingsRules+=@(Group-Title '模型' 12)
Input-Field 'baseURL' '服务地址' 40; Input-Field 'model' '模型名称' 74; Input-Field 'apiKey' 'API Key' 108
$settingsRules+=@(Group-Title '语音' 147)
$voiceInfo=Label $settingsCard '语音合成：GPT-SoVITS　·　语音识别：SenseVoice' 20 173 700 25 9 $muted
$settingsRules+=@(Group-Title '端口' 205)
Input-Field 'TTS' 'TTS 端口' 234; Input-Field 'ASR' 'ASR 端口' 268
$save=Button $settingsPage '保存' 0 0 96 34 $accent
$reload=Button $settingsPage '恢复默认' 0 0 112 34 $surface2 $muted
function Load-Settings {
    $config = Read-Config; $ports = Read-Ports $config
    foreach ($key in @('baseURL','model','apiKey')) { $settingsFields[$key].Text = [string]$config.llm.$key }
    foreach ($key in @('TTS','ASR')) { $settingsFields[$key].Text = [string]$ports[$key] }
}
$reload.Add_Click({ Act {
    $settingsFields.baseURL.Text='https://discovery-api.intern-ai.org.cn/v1'
    $settingsFields.model.Text='deepseek-v4-flash-vision'; $settingsFields.apiKey.Text=''
    $settingsFields.TTS.Text='9881'; $settingsFields.ASR.Text='8000'
    Report '已填入发布包默认值；点击保存后生效。'
} })
$save.Add_Click({ Act {
    $config = Read-Config; $ports = Read-Ports $config; $owned = Get-OwnedProcesses
    if ($owned.ContainsKey('Pet')) { throw '请先退出本目录桌宠，再保存设置。' }
    foreach ($key in @('TTS','ASR')) {
        $newPort = 0
        if (![int]::TryParse($settingsFields[$key].Text, [ref]$newPort) -or $newPort -lt 1 -or $newPort -gt 65535) { throw "$key 端口需在 1–65535 之间。" }
        if ($newPort -ne $ports[$key] -and ($owned.ContainsKey($key) -or ($key -eq 'ASR' -and $script:AsrStarter -and !$script:AsrStarter.HasExited))) { throw "请先停止本目录 $key，再修改端口。" }
        $builder = [UriBuilder]::new([string]$config.$key.url); $builder.Port = $newPort
        $config.$key.url = $builder.Uri.AbsoluteUri
    }
    $newPorts = Read-Ports $config
    if (@($newPorts.Values | Sort-Object -Unique).Count -ne 3) { throw 'TTS、ASR 与桌宠控制口不得重复。' }
    foreach ($key in @('baseURL','model','apiKey')) { $config.llm | Add-Member -NotePropertyName $key -NotePropertyValue $settingsFields[$key].Text.Trim() -Force }
    $temp = $ConfigFile + '.launcher.tmp'
    try {
        [IO.File]::WriteAllText($temp,($config | ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
        [IO.File]::Replace($temp,$ConfigFile,[NullString]::Value)
    } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
    Report '设置已保存。'; Refresh-Status
} })

$logPage=$content['日志']; $null=Label $logPage '日志' 0 0 180 36 20 -Bold
$logPicker=Place $logPage (New-Object Windows.Forms.ComboBox) 0 53 450 30
$logPicker.DropDownStyle='DropDownList'; $logPicker.ForeColor=$text; $logPicker.FlatStyle='Flat'
Feedback $logPicker $surface2 $border $surface
$refresh=Button $logPage '刷新' 466 51 88 32 $surface2
$autoScroll=Place $logPage (New-Object Windows.Forms.CheckBox) 570 51 118 32
$autoScroll.Text='自动滚动'; $autoScroll.ForeColor=$text; $autoScroll.Checked=$true; $autoScroll.FlatStyle='Flat'
Feedback $autoScroll $bg $surface2 $surface
$logs=New-Object Windows.Forms.RichTextBox
$logs.ReadOnly=$true; $logs.ScrollBars='Both'; $logs.WordWrap=$false; $logs.DetectUrls=$false; $logs.BorderStyle='None'
$logs.Font=[Drawing.Font]::new('Consolas',9); $logs.BackColor=$surface2; $logs.ForeColor=$text
$logs=Place $logPage $logs 0 99 752 398
$script:UpdatingLogs=$false; $script:LogStamp=$null
function Refresh-Logs {
    if($logPicker.DroppedDown){return}
    $selected=[string]$logPicker.SelectedItem
    $files=@(Get-ChildItem -LiteralPath $LogDir -File -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    $names=@($files | ForEach-Object {$_.Name})
    if(($names -join '|') -ne (@($logPicker.Items) -join '|')) {
        $script:UpdatingLogs=$true
        try {
            $logPicker.Items.Clear()
            foreach($file in $files){$null=$logPicker.Items.Add($file.Name)}
            if($selected -and $logPicker.Items.Contains($selected)){$logPicker.SelectedItem=$selected}
            elseif($files.Count){$logPicker.SelectedIndex=0}
        } finally {$script:UpdatingLogs=$false}
    }
    $file=$files | Where-Object Name -eq $logPicker.SelectedItem | Select-Object -First 1
    if(!$file){$logs.Text='暂无日志。'; $script:LogStamp=$null; return}
    $stamp='{0}|{1}|{2}' -f $file.FullName,$file.Length,$file.LastWriteTimeUtc.Ticks
    if($stamp -eq $script:LogStamp){return}
    $tail=New-Object 'System.Collections.Generic.Queue[string]'
    $stream=[IO.File]::Open($file.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    $count=0
    try {
        $reader=[IO.StreamReader]::new($stream,[Text.Encoding]::UTF8,$true)
        try {
            while($null -ne ($line=$reader.ReadLine())){
                $count++; if($tail.Count -ge 500){$null=$tail.Dequeue()}; $tail.Enqueue($line)
            }
        } finally {$reader.Dispose()}
    } finally {$stream.Dispose()}
    $number=$count-$tail.Count; $digits=[Math]::Max(4,([string]$count).Length)
    $lines=@(foreach($line in $tail){$number++; ([string]$number).PadLeft($digits)+'  │  '+$line})
    $logs.Text=if($lines.Count){$lines -join "`n"}else{'日志文件为空。'}; $script:LogStamp=$stamp
    if($autoScroll.Checked){$logs.SelectionStart=$logs.TextLength; $logs.ScrollToCaret()}
}
$refresh.Add_Click({Act {$script:LogStamp=$null; Refresh-Logs}})
$autoScroll.Add_CheckedChanged({if($autoScroll.Checked){Act {Refresh-Logs; $logs.SelectionStart=$logs.TextLength; $logs.ScrollToCaret()}}})
$logPicker.Add_SelectedIndexChanged({if(!$script:UpdatingLogs){Act {Refresh-Logs}}})

# ========== 高级配置 ==========
$advancedPage=$content['高级']; $null=Label $advancedPage '高级配置' 0 0 180 36 20 -Bold
$personaCard=Card $advancedPage 0 48 752 200
$null=Label $personaCard '统一人设' 20 12 140 28 13 -Bold
$personaText=Place $personaCard (New-Object Windows.Forms.TextBox) 20 48 712 130
$personaText.Multiline=$true; $personaText.ScrollBars='Vertical'; $personaText.Font=[Drawing.Font]::new('Microsoft YaHei UI',10)
$personaText.BackColor=$surface2; $personaText.ForeColor=$text; $personaText.BorderStyle='None'; Round-Box $personaText

$budgetCard=Card $advancedPage 0 264 364 124
$null=Label $budgetCard '上下文预算' 20 12 200 28 13 -Bold
$null=Label $budgetCard '输入令牌上限' 20 52 120 24 9 $muted
$budgetInput=Place $budgetCard (New-Object Windows.Forms.NumericUpDown) 150 50 180 28
$budgetInput.Minimum=1000; $budgetInput.Maximum=200000; $budgetInput.Value=32000; $budgetInput.Increment=1000
$budgetInput.BackColor=$surface2; $budgetInput.ForeColor=$text; $budgetInput.BorderStyle='None'; Round-Box $budgetInput
$null=Label $budgetCard '输出令牌上限' 20 86 120 24 9 $muted
$budgetOutput=Place $budgetCard (New-Object Windows.Forms.NumericUpDown) 150 84 180 28
$budgetOutput.Minimum=500; $budgetOutput.Maximum=16000; $budgetOutput.Value=8000; $budgetOutput.Increment=500
$budgetOutput.BackColor=$surface2; $budgetOutput.ForeColor=$text; $budgetOutput.BorderStyle='None'; Round-Box $budgetOutput

$shareCard=Card $advancedPage 388 264 364 124
$null=Label $shareCard '限时共享' 20 12 200 28 13 -Bold
$shareEnabled=Place $shareCard (New-Object Windows.Forms.CheckBox) 20 52 320 28
$shareEnabled.Text='启用限时共享链接'; $shareEnabled.ForeColor=$text; $shareEnabled.Font=[Drawing.Font]::new('Microsoft YaHei UI',10)
$null=Label $shareCard '有效期（分钟）' 20 86 120 24 9 $muted
$shareDuration=Place $shareCard (New-Object Windows.Forms.NumericUpDown) 150 84 180 28
$shareDuration.Minimum=5; $shareDuration.Maximum=1440; $shareDuration.Value=30; $shareDuration.Increment=5
$shareDuration.BackColor=$surface2; $shareDuration.ForeColor=$text; $shareDuration.BorderStyle='None'; Round-Box $shareDuration

$diagCard=Card $advancedPage 0 404 752 80
$null=Label $diagCard '控制 API 诊断' 20 12 200 28 13 -Bold
$diagButton=Button $diagCard '运行诊断' 20 48 140 28 $accent
$diagResult=Label $diagCard '等待诊断...' 180 48 540 28 9 $muted

$saveAdvanced=Button $advancedPage '保存高级配置' 0 500 160 34 $accent
$saveAdvanced.Add_Click({Act {
    $config=Read-Config
    $config.persona=$personaText.Text
    $config.budget=@{input=[int]$budgetInput.Value;output=[int]$budgetOutput.Value}
    $config.share=@{enabled=$shareEnabled.Checked;duration=[int]$shareDuration.Value}
    $json=$config|ConvertTo-Json -Depth 10 -Compress
    [IO.File]::WriteAllText($ConfigFile,$json,[Text.Encoding]::UTF8)
    Report '高级配置已保存'
}})

# ========== 记忆管理 ==========
$memoryPage=$content['记忆']; $null=Label $memoryPage '记忆管理' 0 0 180 36 20 -Bold
$memoryCard=Card $memoryPage 0 48 752 420
$null=Label $memoryCard '显式记忆库' 20 12 200 28 13 -Bold
$memorySearch=Place $memoryCard (New-Object Windows.Forms.TextBox) 240 12 360 28
$memorySearch.BackColor=$surface2; $memorySearch.ForeColor=$text; $memorySearch.BorderStyle='None'; Round-Box $memorySearch
$memorySearch.Font=[Drawing.Font]::new('Microsoft YaHei UI',10); $memorySearch.Text='搜索记忆...'
$memoryList=Place $memoryCard (New-Object Windows.Forms.ListBox) 20 52 712 300
$memoryList.BackColor=$surface2; $memoryList.ForeColor=$text; $memoryList.BorderStyle='None'; Round-Box $memoryList
$memoryList.Font=[Drawing.Font]::new('Microsoft YaHei UI',10)
$addMemory=Button $memoryCard '+ 添加' 20 364 100 36 $accent $null -Rounded
$editMemory=Button $memoryCard '编辑' 132 364 100 36 $surface2 $text -Rounded
$deleteMemory=Button $memoryCard '删除' 244 364 100 36 $surface2 $bad -Rounded
$importMemory=Button $memoryCard '导入' 532 364 100 36 $surface2 $text -Rounded
$exportMemory=Button $memoryCard '导出' 644 364 100 36 $surface2 $text -Rounded

# ========== 自主陪伴 ==========
$companionPage=$content['陪伴']; $null=Label $companionPage '自主陪伴' 0 0 180 36 20 -Bold
$companionCard=Card $companionPage 0 48 752 380
$null=Label $companionCard '运行配置' 20 12 200 28 13 -Bold
$companionEnabled=Place $companionCard (New-Object Windows.Forms.CheckBox) 20 52 320 28
$companionEnabled.Text='启用自主陪伴'; $companionEnabled.ForeColor=$text; $companionEnabled.Font=[Drawing.Font]::new('Microsoft YaHei UI',11,[Drawing.FontStyle]::Bold)
$null=Label $companionCard '陪伴频率（分钟）' 20 92 140 24 9 $muted
$companionInterval=Place $companionCard (New-Object Windows.Forms.NumericUpDown) 180 90 180 28
$companionInterval.Minimum=1; $companionInterval.Maximum=120; $companionInterval.Value=15; $companionInterval.Increment=5
$companionInterval.BackColor=$surface2; $companionInterval.ForeColor=$text; $companionInterval.BorderStyle='None'; Round-Box $companionInterval

$null=Label $companionCard '感知权限' 20 132 200 28 12 -Bold
$cameraEnabled=Place $companionCard (New-Object Windows.Forms.CheckBox) 20 166 320 28
$cameraEnabled.Text='允许摄像头感知'; $cameraEnabled.ForeColor=$text; $cameraEnabled.Font=[Drawing.Font]::new('Microsoft YaHei UI',10)
$screenshotEnabled=Place $companionCard (New-Object Windows.Forms.CheckBox) 20 200 320 28
$screenshotEnabled.Text='允许截屏感知'; $screenshotEnabled.ForeColor=$text; $screenshotEnabled.Font=[Drawing.Font]::new('Microsoft YaHei UI',10)

$null=Label $companionCard '虚拟作息' 20 240 200 28 12 -Bold
$null=Label $companionCard '活跃时段' 20 274 100 24 9 $muted
$scheduleStart=Place $companionCard (New-Object Windows.Forms.NumericUpDown) 130 272 80 28
$scheduleStart.Minimum=0; $scheduleStart.Maximum=23; $scheduleStart.Value=8
$scheduleStart.BackColor=$surface2; $scheduleStart.ForeColor=$text; $scheduleStart.BorderStyle='None'; Round-Box $scheduleStart
$null=Label $companionCard ':00 至' 220 274 50 24 9 $muted
$scheduleEnd=Place $companionCard (New-Object Windows.Forms.NumericUpDown) 280 272 80 28
$scheduleEnd.Minimum=0; $scheduleEnd.Maximum=23; $scheduleEnd.Value=23
$scheduleEnd.BackColor=$surface2; $scheduleEnd.ForeColor=$text; $scheduleEnd.BorderStyle='None'; Round-Box $scheduleEnd
$null=Label $companionCard ':00' 370 274 40 24 9 $muted

$saveCompanion=Button $companionPage '保存陪伴配置' 0 444 160 34 $accent
$saveCompanion.Add_Click({Act {
    $config=Read-Config
    $config.companion=@{
        enabled=$companionEnabled.Checked
        interval=[int]$companionInterval.Value
        camera=$cameraEnabled.Checked
        screenshot=$screenshotEnabled.Checked
        schedule=@{start=[int]$scheduleStart.Value;end=[int]$scheduleEnd.Value}
    }
    $json=$config|ConvertTo-Json -Depth 10 -Compress
    [IO.File]::WriteAllText($ConfigFile,$json,[Text.Encoding]::UTF8)
    Report '陪伴配置已保存'
}})

# ========== 系统维护 ==========
$maintPage=$content['维护']; $null=Label $maintPage '系统维护' 0 0 180 36 20 -Bold
$cleanCard=Card $maintPage 0 48 752 140
$null=Label $cleanCard '旧数据清理' 20 12 200 28 13 -Bold
$null=Label $cleanCard '清理早于（天数）' 20 56 140 24 9 $muted
$cleanDays=Place $cleanCard (New-Object Windows.Forms.NumericUpDown) 180 54 120 28
$cleanDays.Minimum=1; $cleanDays.Maximum=365; $cleanDays.Value=30; $cleanDays.Increment=7
$cleanDays.BackColor=$surface2; $cleanDays.ForeColor=$text; $cleanDays.BorderStyle='None'; Round-Box $cleanDays
$cleanButton=Button $cleanCard '执行清理' 320 54 140 28 $bad
$cleanStatus=Label $cleanCard '等待操作...' 20 96 700 28 9 $muted

$backupCard=Card $maintPage 0 204 364 140
$null=Label $backupCard '配置备份' 20 12 200 28 13 -Bold
$backupButton=Button $backupCard '备份配置' 20 56 140 28 $accent
$restoreButton=Button $backupCard '恢复配置' 180 56 140 28 $surface2 $text
$backupStatus=Label $backupCard '无操作' 20 96 310 28 9 $muted

$archiveCard=Card $maintPage 388 204 364 140
$null=Label $archiveCard '日志归档' 20 12 200 28 13 -Bold
$archiveButton=Button $archiveCard '归档日志' 20 56 140 28 $accent
$archiveStatus=Label $archiveCard '无操作' 20 96 310 28 9 $muted

$cleanButton.Add_Click({Act {
    $days=[int]$cleanDays.Value
    $cutoff=(Get-Date).AddDays(-$days)
    $removed=0
    Get-ChildItem -LiteralPath $LogDir -File -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -lt $cutoff} | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force; $removed++}
    $cleanStatus.Text="已清理 $removed 个文件"; Report "清理完成：$removed 个文件"
}})

$backupButton.Add_Click({Act {
    $timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath="$Root\config-backup-$timestamp.json"
    Copy-Item -LiteralPath $ConfigFile -Destination $backupPath
    $backupStatus.Text="已备份至 $timestamp"; Report "配置已备份"
}})

$restoreButton.Add_Click({Act {
    $backups=Get-ChildItem -LiteralPath $Root -Filter 'config-backup-*.json' | Sort-Object LastWriteTime -Descending
    if($backups.Count -eq 0){throw '无备份可恢复'}
    Copy-Item -LiteralPath $backups[0].FullName -Destination $ConfigFile -Force
    $backupStatus.Text="已恢复 $($backups[0].Name)"; Report "配置已恢复"; Load-Settings
}})

$archiveButton.Add_Click({Act {
    $timestamp=Get-Date -Format 'yyyyMMdd-HHmmss'
    $archivePath="$LogDir\archive-$timestamp"
    New-Item -ItemType Directory -Path $archivePath -Force | Out-Null
    Get-ChildItem -LiteralPath $LogDir -File -Filter '*.log' | ForEach-Object {Move-Item -LiteralPath $_.FullName -Destination $archivePath}
    $archiveStatus.Text="已归档至 $timestamp"; Report "日志已归档"
}})

$aboutPage=$content['关于']; $about=Card $aboutPage 0 0 752 388
$null=Label $about ' 关于' 20 10 150 36 20 -Bold
$aboutLogo=Logo $about 0 24 80
$aboutTitle=Label $about '大肥鱼桌宠' 0 108 752 38 22 -Bold
$aboutVersion=Label $about "应用 v$($version.app)  /  启动器 v$($version.launcher)  ·  构建日期 $($version.build)" 0 149 752 28 9 $muted
$aboutTitle.TextAlign=$aboutVersion.TextAlign='MiddleCenter'
function File-Version([string]$File) {
    if(Test-Path -LiteralPath $File -PathType Leaf){(Get-Item -LiteralPath $File).VersionInfo.ProductVersion}else{'未安装'}
}
$ttsVersion='未记录'; $inferPath=$null
try {$inferPath=(Read-Config).tts.inferConfig} catch { $ttsVersion='配置无法读取' }
if($inferPath -and (Test-Path -LiteralPath $inferPath -PathType Leaf)){
    $match=[regex]::Match([IO.File]::ReadAllText($inferPath),'(?m)^custom:[ \t]*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*?[ \t]+version:[ \t]*([^\r\n#]+)')
    if($match.Success){$ttsVersion=$match.Groups[1].Value.Trim()+'（模型配置）'}
}
$aboutTable=Card $about 20 171 712 152; $aboutTable.BackColor=$surface
$aboutValues=@(); $index=0
foreach($row in @(@('安装目录',$Root),@('Electron',(File-Version $Electron)),@('Python（语音运行时）',(File-Version $TtsPython)),@('GPT-SoVITS',$ttsVersion))) {
    $top=8+$index*34
    $null=Label $aboutTable $row[0] 20 $top 164 33 9 $muted
    $aboutValues+=Label $aboutTable $row[1] 184 $top 496 33 10
    $index++
}
$rollback=Label $about '回滚快照：版本目录 _versions\ 或你自己的备份位置' 20 337 712 30 9 $faint
$rollback.TextAlign='MiddleCenter'

function Layout-Launcher {
    $width=$form.ClientSize.Width; $height=$form.ClientSize.Height
    $titlebar.Width=$width-2; $minimize.Left=$titlebar.Width-92; $close.Left=$titlebar.Width-44
    $nav.Height=$height-66; $body.SetBounds(181,65,($width-182),($height-97))
    $grip.SetBounds(($width-24),($height-24),23,23)
    $contentWidth=[Math]::Min(864,$body.Width-48)
    $contentHeight=$body.Height-20
    $contentLeft=[int](($body.Width-$contentWidth)/2)
    $status.SetBounds((181+$contentLeft),($height-32),([Math]::Min($contentWidth,$width-206-$contentLeft)),31)
    foreach($panel in $content.Values){$panel.SetBounds($contentLeft,20,$contentWidth,$contentHeight)}
    $stopAll.Left=$contentWidth-$stopAll.Width; $launchCard.Width=$contentWidth
    $launch.Left=$contentWidth-$launch.Width-24; $intro.Width=$launch.Left-$intro.Left-16
    $tileWidth=[int][Math]::Floor(($contentWidth-32)/3); $index=0
    foreach($key in 'TTS','ASR','Pet') {
        $left=$index*($tileWidth+16); $widthForTile=if($index -eq 2){$contentWidth-$left}else{$tileWidth}
        $quick[$key].Card.SetBounds($left,196,$widthForTile,104); $index++
    }
    $recent.SetBounds(0,316,$contentWidth,([Math]::Min(148,$contentHeight-316)))
    $recentFile.Width=$contentWidth-170
    foreach($entry in $recentLines){$entry.Width=$contentWidth-40}
    foreach($key in 'TTS','ASR','Pet') {
        $serviceCards[$key].Width=$contentWidth
        $serviceButtons[$key].Start.Left=$contentWidth-$serviceButtons[$key].Start.Width-16
        $serviceButtons[$key].Stop.Left=$contentWidth-$serviceButtons[$key].Stop.Width-16-$serviceButtons[$key].Start.Width-12
        $serviceButtons[$key].Config.Left=$contentWidth-$serviceButtons[$key].Config.Width-16-$serviceButtons[$key].Start.Width-12-$serviceButtons[$key].Stop.Width-12
    }
    $serviceLogCard.Width=$contentWidth
    $serviceLogFilter.Left=170; $serviceLogFilter.Width=[Math]::Min(140,$contentWidth-190)
    foreach($line in $serviceLogLines){$line.Width=$contentWidth-40}
    $settingsCard.Width=$contentWidth; $voiceInfo.Width=$contentWidth-40
    foreach($rule in $settingsRules){$rule.Width=$contentWidth-40}
    foreach($key in $settingsInputs.Keys) {
        $settingsInputs[$key].Width=$contentWidth-168
        $settingsFields[$key].Width=$contentWidth-184
        $settingsFields[$key].Tag.Width=$contentWidth-168
    }
    $save.Location=[Drawing.Point]::new(($contentWidth-96),($contentHeight-42))
    $reload.Location=[Drawing.Point]::new(($save.Left-128),$save.Top)
    $logPicker.Width=$contentWidth-238; $refresh.Left=$contentWidth-222; $autoScroll.Left=$contentWidth-118
    $logs.Size=[Drawing.Size]::new($contentWidth,($contentHeight-115))
    $about.Width=$contentWidth; $aboutLogo.Left=[int](($contentWidth-80)/2)
    $aboutTitle.Width=$aboutVersion.Width=$contentWidth
    $aboutTable.Width=$rollback.Width=$contentWidth-40
    foreach($entry in $aboutValues){$entry.Width=$aboutTable.Width-204}
}
$form.Add_ClientSizeChanged({Layout-Launcher})
Layout-Launcher

function Test-LayoutBounds($Parent) {
    foreach($child in $Parent.Controls) {
        if(!$child.Visible){continue}
        if($child.Left -lt 0 -or $child.Top -lt 0 -or $child.Right -gt $Parent.ClientSize.Width -or $child.Bottom -gt $Parent.ClientSize.Height){
            throw "布局越界：$($child.GetType().Name) '$($child.Text)' $($child.Bounds) / $($Parent.ClientSize)"
        }
        if($child -is [Windows.Forms.Panel]){Test-LayoutBounds $child}
    }
}

function Refresh-Status {
    $config=Read-Config; $ports=Read-Ports $config; $owned=Get-OwnedProcesses; $files=Get-ComponentFiles $config
    $available = @($files.Values | Where-Object {$_}).Count
    $runtimeLabel.Text = if($available -eq 3){'● 运行时就绪'}elseif($available){'● 部分运行时缺失'}else{'● 运行时缺失'}
    $runtimeLabel.ForeColor = if($available -eq 3){$ok}elseif($available){$warn}else{$bad}
    if ($script:PageName -eq '启动') { Refresh-Recent }
    foreach ($key in @('TTS','ASR','Pet')) {
        $listening=Test-Tcp $ports[$key]
        $launchingAsr=$key -eq 'ASR' -and $script:AsrStarter -and !$script:AsrStarter.HasExited
        $state='未启动'; $ink=$idle
        if (!$files[$key]) { $state='运行文件缺失'; $ink=$bad }
        elseif ($owned.ContainsKey($key) -and $listening) { $state='就绪'; $ink=$ok }
        elseif ($owned.ContainsKey($key) -or $launchingAsr) { $state='启动中'; $ink=$warn }
        elseif ($listening) { $state='外部进程占用'; $ink=$warn }
        if ($script:Started.ContainsKey($key) -and $script:Started[$key].HasExited) {
            $exitCode = $script:Started[$key].ExitCode
            if ($exitCode -ne 0 -or ($key -ne 'ASR' -and !$owned.ContainsKey($key))) { Report "$key 进程已退出（退出码 $exitCode），详情见日志。" -Failed }
            $script:Started.Remove($key)
        }
        $serviceLabels[$key].Text=$state; $serviceLabels[$key].ForeColor=$ink
        $servicePorts[$key].Text="端口 $($ports[$key])"
        if ($serviceButtons.ContainsKey($key) -and $serviceButtons[$key].Start) {
            $serviceButtons[$key].Start.Enabled=$files[$key] -and !$owned.ContainsKey($key) -and !$launchingAsr
            $serviceButtons[$key].Stop.Enabled=$owned.ContainsKey($key)
            Set-Dot $serviceButtons[$key].Dot $ink
        }
        Set-Dot $quick[$key].Dot $ink; $quick[$key].Port.Text="端口 $($ports[$key])"
        $quick[$key].State.Text=$state; $quick[$key].State.ForeColor=$ink
        $quick[$key].Bar.Visible=$ink -eq $ok
    }
}
$timer = New-Object Windows.Forms.Timer; $timer.Interval=2400
$timer.Add_Tick({ Act {
    Refresh-Status
    if ($script:PageName -eq '日志' -and $autoScroll.Checked) { Refresh-Logs }
    if ($script:PageName -eq '服务') { Refresh-ServiceLogs }
} })
$form.Add_Shown({
    Set-Round $form 12  # 主窗体圆角
    $form.WindowState = 'Normal'; $form.ShowInTaskbar = $true; $form.Activate()
    Act { Load-Settings; Show-Page '启动'; Refresh-Status }
    $timer.Start()
    if ($SmokeTest) {
        Act {
            foreach($size in @([Drawing.Size]::new(980,620),[Drawing.Size]::new(820,520),[Drawing.Size]::new(1180,700))) {
                $form.Size=$size
                foreach($page in @('服务','设置','日志','关于','启动')) {
                    $navButtons[$page].PerformClick(); [Windows.Forms.Application]::DoEvents()
                    if($script:PageName -ne $page){throw "切页失败：$page"}
                    Test-LayoutBounds $pages[$page]
                }
                Test-LayoutBounds $titlebar
            }
            $navButtons['设置'].PerformClick(); $reload.PerformClick()
            if($settingsFields.TTS.Text -ne '9881' -or $settingsFields.apiKey.Text){throw '恢复默认值未填入。'}
            Load-Settings
            $navButtons['日志'].PerformClick(); $autoScroll.Checked=$false; $refresh.PerformClick(); $autoScroll.Checked=$true
        }
        $form.Close()
    }
})
try { [void]$form.ShowDialog() } finally { $timer.Stop(); $timer.Dispose(); $form.Dispose() }
if ($SmokeTest -and $script:SmokeFailure) { throw $script:SmokeFailure }
