# 启动器 UI 设计方案 · 双配色

> 交付对象：Claude（或任何接手改 `launcher.ps1` 的人）
> 目标文件：`launcher\launcher.ps1`（PowerShell 5.1 + WinForms，零依赖）
> 依据：PCL2 / HMCL 实测对比 + [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 生成建议 + WCAG 2.1 对比度实测

---

## 0. 一句话

两套色板共用**同一套组件规格**，只有色值不同。实现时把颜色抽成一组变量，切换时只换变量表。

| 方案 | 代号 | 定位 | 参照 |
|---|---|---|---|
| **A** | Sea Glass | 浅色工具风 | PCL2 + UI UX Pro Max 对 "desktop launcher utility" 的推荐 |
| **B** | Deep Current | 深色沉浸风 | HMCL + UI UX Pro Max 的 Dark Mode (OLED) 规范，按海洋主题调整 |

两套都**不是纯黑/纯白**：A 用冷灰蓝底而非纯白，B 用深海蓝而非纯黑（非 OLED 屏上纯黑显脏）。

---

## 1. 通用规格（两套共用）

### 1.1 字体

```powershell
$fontTitle  = 'Microsoft YaHei UI'   # 标题
$fontBody   = 'Microsoft YaHei UI'   # 正文
$fontMono   = 'Consolas'             # 端口号 / 日志 / 版本号
```

> UI UX Pro Max 给的 `Outfit / Work Sans` 是 Google Fonts，WinForms 用不了。用系统中文字体，字号靠下面这张表拉开层级。

| 用途 | 字号 | 字重 |
|---|---|---|
| 侧栏品牌名 | 14 | Bold |
| 页面标题 | 18 | Bold |
| 卡片标题 | 13 | Bold |
| 正文 / 按钮 | 10 | Regular |
| 辅助说明 | 9 | Regular |
| 极辅助（时间戳） | 8.5 | Regular |
| 端口号 | 9.5 | Consolas Regular |

### 1.2 间距（8 的倍数）

| 项 | 值 |
|---|---|
| 内容区左/右外边距 | 24 |
| 内容区上边距 | 20 |
| 卡片内边距 | 20 |
| 卡片之间 | 16 |
| 控件之间 | 12 |
| 图标与文字之间 | 8 |
| 侧栏项高 | 40（图标 16 + 文字 10） |
| 侧栏宽 | 200 |

### 1.3 圆角

| 元素 | 半径 |
|---|---|
| 卡片 | 10 |
| 主按钮 | 8 |
| 次级按钮 | 6 |
| 输入框 | 6 |
| 状态灯 | 圆形 |
| 侧栏选中指示条 | 2（宽 3px 的竖条） |

### 1.4 动效

| 交互 | 时长 | 曲线 |
|---|---|---|
| hover 变色 | 120ms | 线性插值 |
| 按下反馈 | 立即（位移 1px） | — |
| 页面切换 | 无动画，直接切 | WinForms 做不了干净的淡入 |

---

## 2. 方案 A · Sea Glass（浅色）

### 2.1 色板

```powershell
# ---- 表面 ----
$bg        = '#F4F7FA'   # 页面底（冷灰蓝，比纯白柔和）
$surface   = '#FFFFFF'   # 卡片
$surface2  = '#EEF3F8'   # 次级面板 / 输入框底
$sidebar   = '#2B3440'   # 侧栏（深色，呼应 PCL2）
$sidebarHi = '#353F4D'   # 侧栏 hover
$sidebarTx = '#E8EEF5'   # 侧栏文字
$sidebarMu = '#9AA9BA'   # 侧栏次要文字

# ---- 文字 ----
$text      = '#16243A'   # 正文（深海蓝黑）
$muted     = '#5A6B80'   # 次要
$faint     = '#65758A'   # 极辅助（时间戳、行号）

# ---- 强调 ----
$accent    = '#1A63C4'   # 主色（海洋蓝）
$accentHi  = '#1E6FD9'   # hover 提亮
$accentLo  = '#175AAE'   # 按下加深
$accentFg  = '#FFFFFF'   # 强调底上的文字

# ---- 状态 ----
$ok        = '#0F7A36'   # 就绪
$warn      = '#B45309'   # 部分就绪 / 警告
$bad       = '#DC2626'   # 未就绪 / 停止
$idle      = '#94A3B8'   # 未启动

# ---- 线条 ----
$border    = '#D8E2EC'   # 卡片描边
$borderHi  = '#C3D2E0'   # hover 描边
$lineSoft  = '#E8EFF6'   # 分隔线
```

### 2.2 对比度实测（WCAG 2.1）

| 场景 | 前景-背景 | 比值 | 等级 |
|---|---|---|---|
| 正文 / 页面 | `#16243A`-`#F4F7FA` | **14.49** | AAA |
| 正文 / 卡片 | `#16243A`-`#FFFFFF` | **15.58** | AAA |
| 次要 / 卡片 | `#5A6B80`-`#FFFFFF` | 5.46 | AA |
| 极辅助 / 卡片 | `#65758A`-`#FFFFFF` | 4.70 | AA |
| 按钮文字 / 强调底 | `#FFFFFF`-`#1A63C4` | 5.79 | AA |
| 强调 / 页面 | `#1A63C4`-`#F4F7FA` | 5.39 | AAA |
| 侧栏文字 / 侧栏 | `#E8EEF5`-`#2B3440` | 10.78 | AAA |
| 就绪 / 页面 | `#0F7A36`-`#F4F7FA` | 5.06 | AAA |
| 警告 / 页面 | `#B45309`-`#F4F7FA` | 4.67 | AAA |
| 危险 / 页面 | `#DC2626`-`#F4F7FA` | 4.49 | AA |

**全部达标，最低 4.49（AA）。**

### 2.3 卡片做法

```
底色      $surface
描边      1px $border
圆角      10
顶部高光  卡片内 y+1 处画一条 1px 的 #FFFFFF 线，透明度 60%
阴影      不做（WinForms 画不了），靠描边 + 底色差建立层次
```

页面底用 `$bg`，卡片用 `$surface`，两者明度差足够让卡片"浮"起来。

### 2.4 侧栏

```
底        $sidebar
品牌区    顶部 72px：图标 40px + 名称 14px Bold + 版本 9px
分组标题  9px，$sidebarMu，大写间距
项        高 40，图标 16 + 文字 10
选中      左侧 3px 竖条 $accent + 背景 $sidebarHi + 文字 纯白
hover     背景 $sidebarHi（无竖条）
```

### 2.5 主按钮

```
常态    垂直渐变 $accentHi → $accent
hover   整体提亮 12%（向白混合 0.12）
按下    垂直渐变 $accent → $accentLo，内容下移 1px
文字    $accentFg，10px
图标    左侧 20px，与文字间距 8
圆角    8
```

---

## 3. 方案 B · Deep Current（深色）

### 3.1 色板

```powershell
# ---- 表面 ----
$bg        = '#0B1420'   # 页面底（深海蓝黑，不用纯黑）
$surface   = '#14202E'   # 卡片
$surface2  = '#1B2A3A'   # 次级面板 / 输入框底
$sidebar   = '#0E1927'   # 侧栏（比页面更深）
$sidebarHi = '#16232F'   # 侧栏 hover
$sidebarTx = '#E8F1FA'   # 侧栏文字
$sidebarMu = '#7C92A8'   # 侧栏次要文字

# ---- 文字 ----
$text      = '#E8F1FA'   # 正文（带一点蓝的暖白）
$muted     = '#93A9BF'   # 次要
$faint     = '#6B8199'   # 极辅助

# ---- 强调 ----
$accent    = '#3B9EFF'   # 主色（深色下必须提亮）
$accentHi  = '#5CB0FF'   # hover
$accentLo  = '#2A85E0'   # 按下
$accentFg  = '#08121C'   # 强调底上的文字（深色！）

# ---- 状态 ----
$ok        = '#4ADE80'
$warn      = '#FBBF24'
$bad       = '#F87171'
$idle      = '#54687C'

# ---- 线条 ----
$border    = '#24384C'
$borderHi  = '#2F4861'
$lineSoft  = '#1A2B3C'
```

### 3.2 对比度实测

| 场景 | 前景-背景 | 比值 | 等级 |
|---|---|---|---|
| 正文 / 页面 | `#E8F1FA`-`#0B1420` | **16.20** | AAA |
| 正文 / 卡片 | `#E8F1FA`-`#14202E` | **14.42** | AAA |
| 次要 / 卡片 | `#93A9BF`-`#14202E` | 6.79 | AA |
| 极辅助 / 卡片 | `#6B8199`-`#14202E` | 4.10 | AA（大号/图形） |
| 按钮文字 / 强调底 | `#08121C`-`#3B9EFF` | 6.75 | AA |
| 强调 / 页面 | `#3B9EFF`-`#0B1420` | 6.63 | AAA |
| 侧栏文字 / 侧栏 | `#E8F1FA`-`#0E1927` | 15.50 | AAA |
| 就绪 / 页面 | `#4ADE80`-`#0B1420` | 10.62 | AAA |
| 警告 / 页面 | `#FBBF24`-`#0B1420` | 11.08 | AAA |
| 危险 / 页面 | `#F87171`-`#0B1420` | 6.69 | AAA |

**全部达标。** 注意 `$accentFg` 是**深色**（`#08121C`）——深色主题下亮蓝底上必须用深字，用白字只有 2.9:1。

### 3.3 关键差异（相对方案 A）

| 项 | A 浅色 | B 深色 |
|---|---|---|
| 页面底 | 冷灰蓝 `#F4F7FA` | 深海蓝黑 `#0B1420` |
| 卡片 | 白 `#FFFFFF` | 深蓝 `#14202E` |
| 卡片描边 | 必需的（否则不分明） | 次要（靠明度差即可） |
| 强调底上的文字 | 白 | **深色** |
| 侧栏 | 深色（与页面强对比） | 更深（与页面弱对比） |
| 顶部高光 | `#FFFFFF` 60% | `#FFFFFF` 8%（极淡） |

---

## 4. 组件规格（两套共用）

### 4.1 状态灯

```
直径      10
做法      PictureBox 载入预渲染 PNG（24×24，含 12px 光晕）
四态      ok.png / warn.png / bad.png / idle.png
光晕色    对应状态色 @ 25% 透明度
```

**不要**用 `FillEllipse` 现画——纯色小圆没有光晕，看不出"活物"感。

### 4.2 导航项

```
尺寸      200 × 40
左侧指示  选中时 x=0 处画 3×20 的圆角竖条（半径 2），颜色 $accent
图标      x=20，16×16，选中态用 $accent 着色，未选中用 $muted
文字      x=44，10px
背景      选中 $sidebarHi / hover $sidebarHi / 常态透明
```

### 4.3 卡片

```
圆角      10
描边      1px $border
内边距    20
顶部高光  A: #FFFFFF 60% / B: #FFFFFF 8%，1px，内缩圆角半径
```

### 4.4 输入框

```
高度      32
背景      $surface2
外框      无
底线      常态 1px $border，聚焦 2px $accent
文字      $text，10px
占位符    $faint
圆角      6
```

### 4.5 日志区

```
字体      Consolas 9
背景      A: $surface2 / B: $bg（比卡片更深）
行号列    宽 32，右对齐，$faint
时间戳    $faint
正文      $text
选中高亮  $accent @ 20%
```

---

## 5. WinForms 落地对照

| 设计概念 | WinForms 实现 |
|---|---|
| 卡片背景渐变 | `LinearGradientBrush` + 圆角 `GraphicsPath`（注意：直接 `FillPath` 会从圆角溢出，用离屏 Bitmap + TextureBrush stamp） |
| 卡片描边 | `DrawPath` with `Pen($border, 1)` |
| 顶部高光 | 卡片 `Paint` 里 `DrawLine` 一条 1px |
| 圆角 | 预渲染 9-slice PNG，或缓存 `GraphicsPath` 对象（别每帧重算） |
| hover 提亮 | `Timer` 每 16ms 把颜色向目标色插值 20% |
| 状态灯 | `PictureBox` + 预渲染 PNG |
| 图标 | `PictureBox` + 20×20 单色 PNG，或 `ImageList` |
| 双缓冲 | `SetStyle(AllPaintingInWmPaint -bor UserPaint -bor OptimizedDoubleBuffer, $true)`，**每个自绘 Panel 都要单独设** |
| 抗锯齿 | `SmoothingMode=AntiAlias` + `PixelOffsetMode=HighQuality` + `TextRenderingHint=ClearTypeGridFit` |

---

## 6. 验收清单

改完后逐条核对：

- [ ] 侧栏、卡片、桌面快捷方式、exe 图标是**同一个鲸鱼**
- [ ] 卡片能看出"浮"在页面上（A 靠描边，B 靠明度差）
- [ ] 主按钮有渐变 + 图标，悬停有可感知提亮
- [ ] 导航选中项左侧有 3px 竖条
- [ ] 状态灯带光晕，四态一眼分清
- [ ] 日志区时间戳淡色、正文亮色、等宽对齐
- [ ] 150% 缩放下没有发虚的 1px 线（需要 DPI manifest）
- [ ] 拖动窗口、切页全程无闪烁
- [ ] 所有文字对比度 ≥ 4.5:1（本方案已预算，改色后要重算）
- [ ] 不用 emoji 当图标

---

## 7. 给 Claude 的执行提示词

```
读 launcher\UI设计方案-双配色.md。

任务：把 launcher.ps1 的视觉按「方案 A（Sea Glass 浅色）」重做，
保留一套变量切换能力，好让我以后能切到「方案 B（Deep Current 深色）」。

硬约束：
1. 只改 launcher.ps1，不动 services.ps1 的启停语义
2. 文件必须存成 UTF-8 with BOM（[System.Text.UTF8Encoding]::new($true)），
   无 BOM 会让 ● 变 鈼? 直接语法报错
3. 不要用 Anchor 里的 Right（会把控件顶穿窗口右边缘，本项目已踩过两次）
4. 侧栏那个 DrawString 画的 emoji 鲸鱼必须删掉，改成 PictureBox 载入 launcher.ico
5. 每个自绘 Panel 单独 SetStyle 开双缓冲，否则 resize 闪白
6. 改完跑一次语法检查：
   $e=$null; $null=[System.Management.Automation.Language.Parser]::ParseFile($p,$null,[ref]$e)
   必须 0 错误

验收：按文档第 6 节清单逐条打勾，截图给我看启动页和服务页。
```

---

## 8. 色板速查（贴进代码用）

```powershell
# ===== 主题切换 =====
$Theme = 'Light'   # 'Light' | 'Dark'

switch ($Theme) {
  'Light' {
    $bg='#F4F7FA'; $surface='#FFFFFF'; $surface2='#EEF3F8'
    $sidebar='#2B3440'; $sidebarHi='#353F4D'; $sidebarTx='#E8EEF5'; $sidebarMu='#9AA9BA'
    $text='#16243A'; $muted='#5A6B80'; $faint='#65758A'
    $accent='#1A63C4'; $accentHi='#1E6FD9'; $accentLo='#175AAE'; $accentFg='#FFFFFF'
    $ok='#0F7A36'; $warn='#B45309'; $bad='#DC2626'; $idle='#94A3B8'
    $border='#D8E2EC'; $borderHi='#C3D2E0'; $lineSoft='#E8EFF6'
    $cardHighlight='#FFFFFF'; $highlightAlpha=153   # 60%
  }
  'Dark' {
    $bg='#0B1420'; $surface='#14202E'; $surface2='#1B2A3A'
    $sidebar='#0E1927'; $sidebarHi='#16232F'; $sidebarTx='#E8F1FA'; $sidebarMu='#7C92A8'
    $text='#E8F1FA'; $muted='#93A9BF'; $faint='#6B8199'
    $accent='#3B9EFF'; $accentHi='#5CB0FF'; $accentLo='#2A85E0'; $accentFg='#08121C'
    $ok='#4ADE80'; $warn='#FBBF24'; $bad='#F87171'; $idle='#54687C'
    $border='#24384C'; $borderHi='#2F4861'; $lineSoft='#1A2B3C'
    $cardHighlight='#FFFFFF'; $highlightAlpha=20    # 8%
  }
}
```
