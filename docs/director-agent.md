# 动作导演协议（preview.11 沿用的 v1 核心）

核心动作协议从preview.6延续；本文件不代替preview.11的人设共享/授权说明。当前共享封套、单次感知、预算及实际验证范围见包根目录 `测试条例-preview11.md`、`验收记录-preview11.md` 和 `compat/dsh-director-plugin/README.md`。下述抬臂挥腕的模型资产限制仍然有效，不把协议支持称为自然张掌招手。

模块为 renderer/director-contract.js；浏览器全局 PetDirectorContract，Node 可直接 require。它只生成和校验数据，不启动进程、不访问网络、不修改模型资产。真实执行与视觉验收由渲染器负责；协议单测通过不代表挥手等动作已完成视觉验收。

## 接口与就绪状态

- buildCapabilities({characterId, characterRevision, params, motions, expressions, displays}) 返回 version:1、characterId、characterRevision、gestures、emotions、outfits、parameters、expressions、displays。
- characterRevision 是当前加载实例的非空字符串，最长 256 字符，与渲染器实际值完全匹配，不是整数。无有效 revision 时返回 null；validatePlan 拒绝为 503。没有额外 ready 字段。
- params 接收现有能力快照的参数数组。parameters 只保留 writable:true、非 physicsOutput、范围与 default 有效且 id 不重复的条目；字段为 id/min/max/default/writable/label。
- displays 接收 Electron 显示器 id 与 bounds（DIP）；不要传屏幕截图像素尺寸。没有显示器快照时不能使用 screen/display 注视。
- validatePlan(plan, capabilities) 返回成功 {ok:true,status:200,plan:cleanPlan}，失败 {ok:false,status,error}。失败不包含原始载荷、秘密值或部分可执行计划。
- buildPrompt(capabilities) 返回能力表在前的导演 system prompt。仅提示词不是安全边界，所有远端输出仍须校验。
- planDialogue(text, capabilities) 固定返回上述校验结果包装体，再附加 source:'deterministic-local-rules'、deterministic:true、llm:false。它不是直接返回 plan，也不是 LLM 调用。

## 当前角色的可核查绑定

目录只对 characterId 为 DeepSeek免费公皮的已审计模型提供具名语义动作。未知模型仍保留它自己真实的 parameters、expressions、displays，不套用这套角色绑定。

审计依据为项目 evidence/runtime/capabilities.json 与 candidate/characters/DeepSeek免费公皮/DeepSeek免费公皮/DeepSeek/ 下的 大肥鱼.cdi3.json、Animation/*.motion3.json、Exp3/*.exp3.json。当前快照有 509 个参数，其中 217 个可写参数、23 个实际表情。217 是可控制通道数，不等于 217 个肉眼可见动作；分隔参数和未使用通道也可能在其中。

| 能力 id | 真实通道 | 默认时长 |
| --- | --- | --- |
| nod / shake / tilt | AngleY / AngleX / AngleZ 输入 | 1200 / 1250 / 1500 ms |
| wink | ParamEyeLOpen | 650 ms |
| surprise | SHOCKEYE、ParamMouthOpenY | 1200 ms |
| wave | Movement2、Param62、Param59、Param60、Param61 | 2600 ms |

wave 参考“默认手切举手”和“举手切默认手”的真实手臂姿态：Param62=0.034、Param59=0.476、Param60=0.86，再增加 Param61 手腕正负摆动。只有两份真实动作名称及全部可写通道、范围均满足时才提供。旧“打招呼”没有手臂通道。进一步核对 `_hotkeys.tsv:20–21`、`.vtube.json` 和 CDI 后确认该姿态实际是“抚胸手”，不是张掌挥手。真实渲染和隐藏肩肘截图确认手臂/手腕运动，但自然张掌招手尚未实现；外部导演应把这个 id 描述为现有手型的抬臂挥腕，不能宣称自然招手已达标。Param56/57 为光效，不是缺失的手型开关；未验证的 Param38 也不能直接当作张掌能力。

情绪别名：happy→＞＜、shy→脸红、sad→流泪、confused→圈圈眼、angry→黑脸、affectionate→爱心眼、nervous→流冷汗、smug→屑屑眼；原表情及其可写依赖缺失时不提供对应别名。smile 使用 EyeSmile/ParamMouthForm，surprised 使用 SHOCKEYE/ParamMouthOpenY。expression cue 也接受实际表情名称。

服装与外观只提供下列显式集合，不通过关键词猜测长裙/短裙方向：

| id 成对集合 | 参数与取值（依表列顺序） |
| --- | --- |
| skirt_default / skirt_alternate | Clothes1：1 / 0 |
| chest_default / chest_alternate | Clothes3：0 / 1 |
| shoes_on / shoes_off | Clothes4：0 / 1 |
| tail_on / tail_off | Clothes5：1 / 0 |
| glasses_on / glasses_off | key11：1 / 0 |
| monocle_on / monocle_off | key12：1 / 0 |
| basin_on / basin_off | key10：1 / 0 |

“裙子切换”和“尾巴开关”资产的 Add -1 是相对默认值的增量，不可直接当作绝对值 -1 写入。Clothes2 是体型，不属于 outfit；仍作为实际可写参数列出，不能因情绪自动修改。身体 Y/Z 的多链物理驱动未在本协议重新映射或标定。

## 严格计划格式

外层仅允许 version、characterRevision、speech、cues。speech 可省略，最长 2000 字符；空 cues 允许纯对话。最多 24 个 cue，每个 at 为非负毫秒数、duration 为正毫秒数，且 at+duration≤30000。数值不做字符串或布尔转换。所有 cue 验证完才返回计划，按 at 稳定排序，同刻保留输入顺序。

所有 cue 共用 at、kind、duration（可省略），其余字段如下；未列出的任何字段均拒绝：

| kind | 额外字段 | 默认 duration |
| --- | --- | --- |
| gesture | name 为能力 id；intensity 可省略，0..1，默认 1 | 对应 durationMs |
| expression | name 为情绪 id 或实际 exp 名称 | 1800 ms |
| outfit | name 为上述显式集合 id | 1000 ms |
| gaze | space、x、y；仅 display 空间需要 displayId | 1200 ms |
| parameters | 非空 set:{真实可写 id:范围内数值} | 1000 ms |

parameters 不接受 null 释放，也不能写物理输出；执行器在有限时段结束或取消时释放导演所有权。intensity 只用于 gesture，不是其他类型的通用字段。默认时长只在省略时补齐，0 不是“永久”。

gaze 三种坐标：

- direction：x/y 均为 [-1,1]，不带 displayId。
- display：实际 displayId，x/y 均为 [0,1]；执行器映射至该显示器 bounds。
- screen：虚拟桌面 DIP，可为负，必须落入一个实际显示器 bounds，不能乘 DPR；显示器间的空隙不算有效屏幕点。

失败状态：400 为格式、未知能力、额外字段或范围错误；422 为不可写参数；409 为角色 revision 已变；503 为能力未就绪。错误使用固定代码，不回显非法 payload。apiKey/token/password 等字段、原型注入、访问器、符号和数组额外属性均不接受。

## 执行端与调用端责任

执行前使用当前能力重新校验，并在任何发声或调度前原子拒绝无效计划；角色切换、替换计划、用户取消或暂停时清理有限时段的状态，不让旧 revision 在新模型执行。gesture 按 duration 缩放关键帧时间，intensity 围绕真实 parameter.default 插值，结束后释放给既有动画/视线/物理所有者，不做全模型强制复位。outfit 为用户显式外观选择，执行端可以保留所选值，不应因普通动作结束被错误清除；这不授权导演自动换装。

调用端必须对外观意图再做门控：不仅 outfit，实际表情和 parameters 也可能改变衣服、体型、饰品或尾巴。不能仅检查 kind==='outfit' 后假定其它通道都没有外观副作用。秘密仅供已有 provider 配置使用，不进入导演 JSON、system prompt、日志或错误回显。

本地回退按明确文本规则选择六类手势之一、情绪、五个注视方向及明确要求的具名外观集合，可组合这些类别；同句手势按首次有效提及选择，否定优先，sad/angry 时保守抑制兴奋动作。它不声称理解复杂语境，也不是 LLM；无适合能力就只显示台词。远端计划是否调用模型、是否成功，以及真实动作视觉效果，应由集成回执另行报告。

## 离线复核

在项目根目录运行 node --test tests/director-contract.test.cjs。测试读取真实快照与原资产，检查 UMD、217 通道、真实手臂绑定、范围/末帧、服装取值、严格 schema、原子拒绝、字符串 revision、时限、坐标、危险字段和本地回退标识。不启动 Electron、不访问运行中控制口，不据此宣称真实云端或原生窗口验收。
