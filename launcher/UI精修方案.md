# 启动器 UI 精修方案

> 目标：把 `launcher.ps1` 里「几乎全是代码画的」界面，改造成有资源、有层次、有质感的现代启动器。
> 现状：v1.1.0 · 980×620 · 深蓝主题 · 所有视觉靠 GDI+ 运行时现画

---

## 一、现状诊断：为什么看起来"粗糙"

逐项拆了 `launcher.ps1` 的绘制方式：

| 元素 | 现在的做法 | 具体问题 |
|---|---|---|
| 侧栏 logo | `DrawString` 画一个 emoji 鲸鱼 | 依赖 `Segoe UI Emoji`，换机器/换系统版本渲染就变，没有品牌一致性 |
| 卡片圆角 | `GraphicsPath` 现算四段圆弧（`Set-Round`） | 每次重绘重算路径；高 DPI 下边缘有锯齿 |
| 卡片背景 | 纯色 `#1a3447` | 平得像色块，没有纵深 |
| 卡片边框 | 无 | 边界靠色差区分，暗色下几乎看不见 |
| 按钮 | `Paint` 事件填纯色 + 手绘圆角 | 没渐变、没图标，hover 只是换个纯色 |
| 导航项 | 纯文字 Button | 选中只是背景变蓝，没有指示条、没有图标 |
| 状态圆点 | 小 Panel 画实心圆 | 纯色小点，没有光晕/内芯，看不出"活物"感 |
| 顶部栏 | 纯色横条 | 和内容区同色，没分隔线，视觉塌在一起 |
| 日志区 | 纯文本 TextBox | 没用等宽字体，时间戳和正文同色 |
| 空状态 | 无 | 缺模型时那块是纯黑 |

**根因**：所有视觉都由 GDI+ 在运行时现算，等于拿代码当设计工具。代码能画形状，画不出质感——渐变、阴影、纹理、图标细节这些必须靠**素材**。

---

## 二、目标参照

对着这三类东西对齐，别凭空想：

1. **PCL2**（你最初的参照）—— 侧栏图标化、中央大按钮、卡片分明、状态用色块+文字
2. **Windows 11 原生应用** —— 圆角 8、卡片 1px 描边 + 顶部极淡高光、分隔线 `#FFFFFF0F`
3. **VS Code 暗色主题** —— 侧栏选中态用左侧竖条 + 稍亮背景，不是整块变色

---

## 三、总体思路：资源化 + 分层绘制

```
┌─ 资源层（PNG/ICO，构建期生成，运行期只加载）────────────┐
│  logo 位图 · 图标集 · 9-slice 卡片 · 阴影 · 空状态插画    │
└──────────────────────────────────────────────────────┘
┌─ 绘制层（GDI+，只做资源画不了的事）─────────────────────┐
│  背景渐变 · 分隔线 · 选中指示条 · 状态圆点                │
└──────────────────────────────────────────────────────┘
┌─ 交互层（Timer + 颜色插值）─────────────────────────────┐
│  hover 提亮 · 按下位移                                    │
└──────────────────────────────────────────────────────┘
```

判断标准一句话：**这个元素换台机器会不会长得不一样？** 会 → 用资源；不会 → 可以代码画。

---

## 四、逐元素改造清单

### P0 — 改完立刻看得出差别（约半天）

| # | 元素 | 改造 | 实现 |
|---|---|---|---|
| 1 | **侧栏 logo** | 换成真图标位图 | `PictureBox` 载入 `launcher.ico` 的 128px 帧，`SizeMode=Zoom`；删掉 `DrawString` 那个 emoji |
| 2 | **品牌区** | logo 36→44px；名称 14px bold、版本 9px muted；下方加 1px 分隔线 | 布局调整 |
| 3 | **卡片背景** | 纯色 → 垂直渐变（`#1E3A52` → `#16293A`）+ 1px 描边 `#2A4A66` | `LinearGradientBrush` + `DrawPath` |
| 4 | **卡片顶部高光** | 内顶 1px 画 `#FFFFFF14` | 一条 `DrawLine`，成本极低、立体感立刻出来 |
| 5 | **主按钮** | 纯色 → 渐变（`#2E9BFF` → `#1E7BE5`）+ 左侧图标；hover 整体提亮 12% | `LinearGradientBrush` + Timer 插值 |
| 6 | **按钮按下** | 内容下移 1px + 底色加深 | `MouseDown/MouseUp` 调 `Padding` |
| 7 | **状态圆点** | 实心纯色 → 外圈光晕 + 内芯 | 预渲染 4 张 PNG（ok/warn/bad/idle，24×24 含 12px 光晕） |
| 8 | **导航选中** | 整块变蓝 → 左侧 3px 竖条 + 背景 `#FFFFFF0F` | 选中项左侧画 3px 圆角条 |

### P1 — 整体质感（约一天）

| # | 元素 | 改造 |
|---|---|---|
| 9 | **9-slice 卡片** | 预渲染 48×48 圆角卡片 PNG（含描边+高光），拉伸成任意尺寸。比每帧算 `GraphicsPath` 快，边缘更干净 |
| 10 | **图标集** | 20×20 单色 PNG ×10：play / stop / refresh / folder / mic / speaker / gear / log / info / drop |
| 11 | **导航项图标化** | 每项左侧 16px 图标 + 8px 间距，文字 10px |
| 12 | **顶部栏** | 与内容区同色 + 底部 1px `#FFFFFF0A`；标题 15px bold、版本 9px muted、状态灯 8px |
| 13 | **日志区** | `Consolas` 9pt；行号列 `#556677` 与正文分离；时间戳 `#778899`、正文 `#C8D6E5`；末尾自动滚 |
| 14 | **服务卡** | 左侧 3px 状态色条（满高、圆角）+ 服务名 13px bold + 端口等宽 + 状态 9px |
| 15 | **设置页输入框** | 无外框 + 底部 1px 线；聚焦时底线变 `#1e88e5` |

### P2 — 打磨（可选）

| # | 元素 | 改造 |
|---|---|---|
| 16 | **卡片阴影** | 预渲染 32px 模糊阴影 PNG，9-slice 贴在卡片下层（WinForms 画不了真阴影，只能贴图） |
| 17 | **页面切换** | 建议**直接切**，不要做假动画（WinForms 的 `Opacity` 会连子控件一起掉） |
| 18 | **空状态** | 无模型时中央放鲸鱼线稿插画 + 「把模型文件夹拖进来」引导 |
| 19 | **高 DPI** | manifest 声明 `PerMonitorV2` + `AutoScaleMode=Font`，否则 150% 缩放下 1px 线全发虚 |

---

## 五、技术要点

### 必须做的四件事

```powershell
# 1) 双缓冲，否则 resize 就闪白
$form.SetStyle([Windows.Forms.ControlStyles]::AllPaintingInWmPaint -bor
               [Windows.Forms.ControlStyles]::UserPaint -bor
               [Windows.Forms.ControlStyles]::OptimizedDoubleBuffer, $true)

# 2) 抗锯齿全套
$g.SmoothingMode     = 'AntiAlias'
$g.PixelOffsetMode   = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'

# 3) 文字
$g.TextRenderingHint = 'ClearTypeGridFit'

# 4) 每个自绘 Panel 也要单独开（Form 的设置不继承）
$panel.SetStyle([Windows.Forms.ControlStyles]::OptimizedDoubleBuffer, $true)
```

### 关于「渐变溢出圆角」这个经典坑

直接用 `FillPath(渐变, 圆角路径)` 时，渐变会从矩形的角上透出来，圆角边缘出现彩色溢边。

行业做法（[HecoUI](https://github.com/khanh779-9/HecoUI) 就是这么干的）：先用**离屏 Bitmap** 画整块渐变，再用 `TextureBrush` 以圆角路径做 clip / stamp，得到像素级干净的圆角渐变，且不产生渐变渗色。

我们不需要整套库，照这个思路在 `Card()` 里做一次就够了。

### 已知坑（本项目踩过，别再踩）

| 坑 | 现象 | 规避 |
|---|---|---|
| `Anchor` 含 `Right` | 控件顶穿窗口右边缘（踩过两次） | 一律固定坐标；自适应用 `Dock` 或 `Resize` 里手算 |
| 文件存成无 BOM UTF-8 | `●` 变 `鈼?`，语法炸 16 处 | 必须 `[System.Text.UTF8Encoding]::new($true)` |
| 每帧现算 `GraphicsPath` | 卡 + 锯齿 | 改 9-slice 或缓存路径对象 |
| emoji 当图标 | 换机器渲染不一致 | 用 PNG |
| `Opacity` 做淡入 | 连子控件一起掉透明度 | 不做 |

---

## 六、需要生成的素材清单

我可以用 Pillow 批量生成（已有 `make_pet_icon.py` 可复用）：

| 文件 | 规格 | 用途 |
|---|---|---|
| `ui/logo-256.png` | 256×256 透明 | 侧栏品牌区、关于页 |
| `ui/logo-64.png` | 64×64 | 卡片内小 logo |
| `ui/ui-icons.png` | 20×20 ×10 格精灵图 | 按钮/导航图标 |
| `ui/dot-{ok,warn,bad,idle}.png` | 24×24（含 12px 光晕） | 状态灯 |
| `ui/card-9slice.png` | 48×48（四角 12px 不变区） | 卡片背景 |
| `ui/shadow-9slice.png` | 64×64 | 卡片投影 |
| `ui/empty-pet.png` | 320×200 | 空状态插画 |

统一色板（和 Claude 那套设置页配色对齐）：

```
bg        #0D1F2D     surface  #16293A    card      #1E3A52
cardTop   #24455F     line     #2A4A66    lineSoft  #FFFFFF0F
accent    #1E88E5     accentHi #2E9BFF    accentLo  #1565C0
text      #E6F0F8     muted    #8FA9BE    faint     #5C7285
ok        #4ADE80     warn     #FBBF24    bad       #F87171
```

---

## 七、两条路线的取舍

| 路线 | 优点 | 缺点 | 工作量 |
|---|---|---|---|
| **A. WinForms + 资源化**（本方案） | 零新依赖；启动 <1s；exe 49 KB；改完立刻能跑 | WinForms 有天花板，做不出真模糊和流畅动效 | 1.5–2 天 |
| **B. WebView2 + HTML/CSS 重写界面** | 现代 UI 能力全开；改样式只动 CSS | Win11 自带但要检测；PowerShell 操作 WebView2 要走 COM，桥接复杂；启动慢 1–2s | 2–3 天 |

**建议先走 A**。你抱怨的是"代码画的没质感"，A 能解决 80%：emoji 换真图标、纯色换渐变、加描边高光、状态灯发光，视觉档位立刻不同。做完还嫌不够再上 B，而且 A 的素材和色板 B 能直接复用。

（如果以后想偷懒用现成组件库，方向是 [HecoUI](https://github.com/khanh779-9/HecoUI)、[DarkUI](https://github.com/colhountech/DarkUI.Net5)、[AcrylicUI](https://github.com/colhountech/AcrylicUI) 这三个 WinForms 暗色库——但它们都是编译期依赖，和现在「PowerShell + 零依赖」的思路冲突，要用就得改成分发 dll。）

---

## 八、验收标准

改完后下面这些必须成立：

1. 侧栏和卡片里的 logo 是**同一个鲸鱼图标**，和桌面快捷方式、exe 图标一致
2. 卡片看得出"浮在背景上"——有描边、有顶部高光
3. 主按钮有渐变和图标，悬停有可感知的提亮
4. 导航选中项左侧有 3px 蓝色竖条
5. 状态灯是带光晕的圆点，绿/灰/红一眼能分
6. 日志区时间戳淡色、正文亮色、等宽对齐
7. 150% 缩放下没有发虚的 1px 线
8. 拖动窗口、切页全程无闪烁

---

## 九、执行顺序

1. 跑素材生成脚本，产出 `ui/` 全套 PNG
2. 改 `Card()` → 9-slice + 描边 + 顶部高光
3. 改 `Logo()` → 删 `DrawString`，换 `PictureBox`
4. 改 `Button-Skin()` / `Button()` → 渐变 + 图标 + hover 插值
5. 改导航 → 图标 + 左侧指示条
6. 改状态灯 → 预渲染 PNG
7. 改日志区 → 等宽 + 分色 + 行号
8. 加 DPI manifest
9. 逐页截图对照验收标准

---

**要我先做哪一段？** 可以立刻开始生成素材（第六节那批 PNG），也可以先动 P0 那 8 项——改完你就能看到一个明显不一样的启动器。
