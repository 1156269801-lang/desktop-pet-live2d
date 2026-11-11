/**
 * 编舞 P0 金样测试：采样数学 + 编译器校验 + 规划器解析。
 * 运行：node engine/test/choreo.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { samplePoints, sampleMotion } = require('../sampler')
const { compilePlan, describeActions, CompileError } = require('../compiler')
const { parsePlanText } = require('../../electron/planner')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

// ---- 采样：与 jingyu compiler.py samplePoints 同一组点位
test('samplePoints 首尾钳制与 smoothstep 中点', () => {
  const pts = [
    [0, 0],
    [1, 10],
  ]
  assert.equal(samplePoints(pts, -5), 0)
  assert.equal(samplePoints(pts, 9), 10)
  assert.equal(samplePoints(pts, 0.5), 5) // smoothstep(0.5)=0.5
  assert.ok(Math.abs(samplePoints(pts, 0.25) - 10 * (0.25 * 0.25 * (3 - 0.5))) < 1e-9)
})

test('samplePoints 多段关键点按段插值', () => {
  const pts = [
    [0, 0],
    [1, 2],
    [2, 2],
    [3, 0],
  ]
  assert.equal(samplePoints(pts, 1), 2)
  assert.equal(samplePoints(pts, 2.5), 1)
})

test('sampleMotion 线性段与阶跃段', () => {
  // [t0,v0] + kind0 线性到 [1,1]，kind3 阶跃到 [2,5]
  const seg = [0, 0, 0, 1, 1, 3, 2, 5]
  assert.ok(Math.abs(sampleMotion(seg, 0.5) - 0.5) < 1e-9)
  assert.equal(sampleMotion(seg, 1.5), 5)
  // 阶跃保持前值（kind2）
  const hold = [0, 0, 2, 1, 7]
  assert.equal(sampleMotion(hold, 0.5), 0)
})

test('sampleMotion 贝塞尔段端点正确', () => {
  // kind1：从 [0,0] 经控制点到 [1,1]
  const seg = [0, 0, 1, 0.33, 0, 0.66, 1, 1, 1]
  assert.ok(Math.abs(sampleMotion(seg, 0)) < 1e-6)
  assert.ok(Math.abs(sampleMotion(seg, 1) - 1) < 1e-3)
})

// ---- 编译器
const profile = {
  allParameters: [
    { id: 'AngleX', min: -30, max: 30, default: 0 },
    { id: 'AngleY', min: -30, max: 30, default: 0 },
    { id: 'AngleZ', min: -30, max: 30, default: 0 },
    { id: 'PositionX', min: -10, max: 10, default: 0 },
    { id: 'PositionY', min: -10, max: 10, default: 0 },
    { id: 'ParamAngleX', min: -30, max: 30, default: 0 },
    { id: 'ParamAngleY', min: -30, max: 30, default: 0 },
    { id: 'ParamAngleZ', min: -30, max: 30, default: 0 },
    { id: 'ParamBodyAngleX', min: -10, max: 10, default: 0 },
    { id: 'ParamEyeBallX', min: -1, max: 1, default: 0 },
    { id: 'ParamEyeBallY', min: -1, max: 1, default: 0 },
    { id: 'Param62', min: -1, max: 1, default: 0 },
  ],
  primary: ['AngleX', 'AngleY', 'AngleZ', 'PositionX', 'PositionY', 'ParamEyeBallX', 'ParamEyeBallY'],
  physicsOutputIds: ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'Param62'],
}

const plan = (actions) => ({ version: 1, intent: 'x', summary: 'y', actions })

test('compile look 向左 → EyeBallX 轨道，末值回到默认', () => {
  const ir = compilePlan(plan([{ kind: 'look', at: 0, duration: 1, direction: 'left', strength: 0.8 }]), profile)
  const x = ir.tracks.find((t) => t.id === 'ParamEyeBallX')
  assert.ok(x, '应有 ParamEyeBallX 轨道')
  assert.ok(x.points.some(([, v]) => v < 0), '向左应为负值')
  assert.equal(x.points.at(-1)[1], 0)
  assert.equal(ir.tracks.some((t) => t.id === 'ParamAngleX'), false, '不得写头部')
  assert.equal(ir.duration, 1.7)
  assert.equal(ir.policy.returnToIdle, true)
})

test('compile look 向上 → EyeBallY 正向', () => {
  const ir = compilePlan(plan([{ kind: 'look', at: 0, duration: 1, direction: 'up' }]), profile)
  const y = ir.tracks.find((t) => t.id === 'ParamEyeBallY')
  assert.ok(y.points.some(([, v]) => v > 0))
})

test('越界值裁剪并记 warning', () => {
  const ir = compilePlan(plan([{ kind: 'look', at: 0, duration: 1, direction: 'right', strength: 1 }]), {
    ...profile,
    allParameters: profile.allParameters.map((p) => (p.id === 'ParamEyeBallX' ? { ...p, min: -0.2, max: 0.2 } : p)),
  })
  assert.ok(ir.tracks[0].points.every(([, v]) => v >= -0.2 && v <= 0.2))
  assert.ok(ir.warnings.some((w) => w.includes('ParamEyeBallX')))
})

test('同参数时间重叠 → CompileError', () => {
  assert.throws(
    () =>
      compilePlan(
        plan([
          { kind: 'look', at: 0, duration: 1.2, direction: 'left' },
          { kind: 'look', at: 0.5, duration: 1.2, direction: 'right' },
        ]),
        profile,
      ),
    CompileError,
  )
})

test('同参数错开时间 → 允许', () => {
  const ir = compilePlan(
    plan([
      { kind: 'look', at: 0, duration: 1, direction: 'left' },
      { kind: 'look', at: 2, duration: 1, direction: 'right' },
    ]),
    profile,
  )
  assert.equal(ir.tracks.length, 2)
})

test('物理输出参数 → 拒绝', () => {
  const bad = { ...profile, primary: ['Param62'] }
  assert.throws(() => compilePlan(plan([{ kind: 'look', at: 0, duration: 1 }]), bad), CompileError)
})

test('头部动作（新设计：写输入侧 AngleX/Y/Z）→ 接受，不再拒绝', () => {
  const ir = compilePlan(plan([{ kind: 'nod', at: 0 }]), profile)
  assert.ok(ir.tracks.some((t) => t.id === 'AngleY'), '点头应写 AngleY')
  assert.equal(ir.tracks.some((t) => t.id === 'ParamAngleY'), false, '不得直接写输出侧 ParamAngleY')
})

// 头部/身体 profile：AngleX/Y/Z、PositionX 为物理输入；ParamAngleX/Y、ParamBodyAngleX 为物理输出
const headProfile = {
  allParameters: [
    { id: 'AngleX', min: -30, max: 30, default: 0 },
    { id: 'AngleY', min: -30, max: 30, default: 0 },
    { id: 'AngleZ', min: -30, max: 30, default: 0 },
    { id: 'PositionX', min: -10, max: 10, default: 0 },
    { id: 'PositionY', min: -10, max: 10, default: 0 },
    { id: 'ParamAngleX', min: -30, max: 30, default: 0 },
    { id: 'ParamAngleY', min: -30, max: 30, default: 0 },
    { id: 'ParamBodyAngleX', min: -10, max: 10, default: 0 },
    { id: 'ParamEyeBallX', min: -1, max: 1, default: 0 },
    { id: 'ParamEyeBallY', min: -1, max: 1, default: 0 },
  ],
  primary: ['AngleX', 'AngleY', 'AngleZ', 'PositionX', 'PositionY', 'ParamEyeBallX', 'ParamEyeBallY'],
  physicsOutputIds: ['ParamAngleX', 'ParamAngleY', 'ParamBodyAngleX'],
}

test('nod 正例：AngleY 往返 2 次，幅度 = 0.8 × 0.35 × 30 = 8.4，末值回默认', () => {
  const ir = compilePlan(plan([{ kind: 'nod', at: 0, duration: 2, strength: 0.8, count: 2 }]), headProfile)
  const t = ir.tracks.find((x) => x.id === 'AngleY')
  assert.ok(t, '应有 AngleY 轨道')
  assert.ok(Math.abs(Math.min(...t.points.map(([, v]) => v)) + 8.4) < 1e-3, '最低点应为 -8.4')
  assert.equal(t.points.at(-1)[1], 0)
  assert.equal(ir.tracks.some((x) => x.id === 'ParamAngleY'), false)
  assert.equal(ir.steps[0].kind, 'nod')
})

test('nod 反例：count 越界 / 非整数 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'nod', count: 5 }]), headProfile), CompileError)
  assert.throws(() => compilePlan(plan([{ kind: 'nod', count: 1.5 }]), headProfile), CompileError)
})

test('nod 反例：duration 超出 0.6..6 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'nod', duration: 0.2 }]), headProfile), CompileError)
  assert.throws(() => compilePlan(plan([{ kind: 'nod', duration: 7 }]), headProfile), CompileError)
})

test('shake_head 正例：AngleX 交替方向，首周期负向、次周期正向', () => {
  const ir = compilePlan(plan([{ kind: 'shake_head', at: 0, duration: 2, strength: 1, count: 2 }]), headProfile)
  const t = ir.tracks.find((x) => x.id === 'AngleX')
  assert.ok(t, '应有 AngleX 轨道')
  const vals = t.points.map(([, v]) => v)
  assert.ok(vals.some((v) => Math.abs(v + 12) < 1e-3), '应有负向峰值 -12')
  assert.ok(vals.some((v) => Math.abs(v - 12) < 1e-3), '第二周期应有正向峰值 +12')
})

test('shake_head 反例：AngleX 不在 primary → 拒绝', () => {
  const bad = { ...headProfile, primary: headProfile.primary.filter((id) => id !== 'AngleX') }
  assert.throws(() => compilePlan(plan([{ kind: 'shake_head' }]), bad), CompileError)
})

test('tilt 正例：left → AngleZ 负向，幅度 0.8 × 0.3 × 30 = 7.2，保持后回默认', () => {
  const ir = compilePlan(plan([{ kind: 'tilt', at: 0, duration: 1.5, direction: 'left', strength: 0.8 }]), headProfile)
  const t = ir.tracks.find((x) => x.id === 'AngleZ')
  assert.ok(t, '应有 AngleZ 轨道')
  assert.ok(Math.abs(Math.min(...t.points.map(([, v]) => v)) + 7.2) < 1e-3)
  assert.equal(t.points.at(-1)[1], 0)
})

test('tilt 反例：direction=up 不在 tilt 允许方向 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'tilt', direction: 'up' }]), headProfile), CompileError)
})

test('pose 正例：PositionX 保持并回默认，label 透传', () => {
  const ir = compilePlan(
    plan([{ kind: 'pose', at: 0, duration: 1.5, values: { PositionX: 5 }, label: '侧身' }]),
    headProfile,
  )
  const t = ir.tracks.find((x) => x.id === 'PositionX')
  assert.ok(t, '应有 PositionX 轨道')
  assert.ok(t.points.some(([, v]) => v === 5))
  assert.equal(t.points.at(-1)[1], 0)
  assert.equal(ir.steps[0].label, '侧身')
})

test('pose 越界值裁剪到模型表范围并记 warning', () => {
  const ir = compilePlan(plan([{ kind: 'pose', values: { AngleX: 999 } }]), headProfile)
  const t = ir.tracks.find((x) => x.id === 'AngleX')
  assert.ok(t.points.every(([, v]) => v <= 30))
  assert.ok(ir.warnings.some((w) => w.includes('AngleX')))
})

test('pose 反例：物理输出 ParamBodyAngleX / ParamAngleX → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: { ParamBodyAngleX: 3 } }]), headProfile), CompileError)
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: { ParamAngleX: 3 } }]), headProfile), CompileError)
})

test('pose 反例：非白名单参数 / 空 values / 超过 8 项 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: { Param62: 1 } }]), headProfile), CompileError)
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: {} }]), headProfile), CompileError)
  const many = {}
  for (let i = 0; i < 9; i += 1) many[`Param${i}`] = 0
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: many }]), headProfile), CompileError)
})

test('pose 反例：非有限数字 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'pose', values: { PositionX: 'big' } }]), headProfile), CompileError)
})

test('头部动作重叠（同 AngleY 同时段）→ 拒绝', () => {
  assert.throws(
    () =>
      compilePlan(
        plan([
          { kind: 'nod', at: 0, duration: 2 },
          { kind: 'nod', at: 0.5, duration: 2 },
        ]),
        headProfile,
      ),
    CompileError,
  )
})

test('describeActions 输出新 kind 且参数范围来自模型表', () => {
  const text = describeActions(headProfile)
  assert.ok(text.includes('nod'))
  assert.ok(text.includes('shake_head'))
  assert.ok(text.includes('tilt'))
  assert.ok(text.includes('pose'))
  assert.ok(text.includes('AngleY∈[-30,30]'))
  assert.ok(!text.includes('ParamBodyAngleX∈'), 'pose 可写列表不得包含物理输出')
})

test('不可用 kind（模型缺少 AngleY）→ 拒绝且 describeActions 不列 nod', () => {
  const noNod = { ...headProfile, primary: headProfile.primary.filter((id) => id !== 'AngleY') }
  assert.throws(() => compilePlan(plan([{ kind: 'nod' }]), noNod), CompileError)
  assert.ok(!describeActions(noNod).includes('- nod'))
})

test('版本与动作数错误 → 拒绝', () => {
  assert.throws(() => compilePlan({ version: 2, actions: [{ kind: 'look' }] }, profile), CompileError)
  assert.throws(() => compilePlan(plan([]), profile), CompileError)
})

test('非有限数字 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'look', at: NaN }]), profile), CompileError)
  assert.throws(() => compilePlan(plan([{ kind: 'look', strength: 'big' }]), profile), CompileError)
})

test('总长超 60 秒 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'look', at: 59.5, duration: 6 }]), profile), CompileError)
})

// ---- 规划器解析
test('parsePlanText 剥围栏、取 plan 包裹、拒 NaN 与 unsupported', () => {
  const fenced = '```json\n{"version":1,"actions":[{"kind":"look"}]}\n```'
  assert.equal(parsePlanText(fenced).version, 1)
  const wrapped = '{"plan":{"version":1,"actions":[{"kind":"look"}]}}'
  assert.equal(parsePlanText(wrapped).actions[0].kind, 'look')
  assert.throws(() => parsePlanText('{"version":1,"actions":[{"at":NaN}]}'), CompileError)
  assert.throws(() => parsePlanText('{"unsupported":"不支持"}'), CompileError)
  assert.throws(() => parsePlanText('没有 JSON'), CompileError)
})


// ---- 手臂联动（jingyu arm_binding.py 移植）
const { bindArmTracks, sample: armSample } = require('../arm-binding')

// fixture 复刻 test_arm_binding.py 的 fixture：四条轨道，forearm 中段为 -0.6 的关键帧。
function armFixture(forearmRest) {
  const joints = { upperArm: 'upperArm', forearm: 'forearm', wrist: 'wrist', perspective: 'perspective' }
  const rest = { upperArm: 0, forearm: forearmRest, wrist: 0, perspective: 0.2 }
  const limits = {
    upperArm: { min: -1, max: 1 },
    forearm: { min: -1, max: 1 },
    wrist: { min: -1, max: 1 },
    perspective: { min: -1, max: 1 },
  }
  const tracks = ['upperArm', 'forearm', 'wrist', 'perspective'].map((k) => {
    const v = rest[k]
    const mid = k === 'forearm' ? -0.6 : k === 'upperArm' ? 0.3 : v
    return {
      id: k,
      points: [
        [0, 0],
        [1, v],
        [2, v],
        [3, mid],
        [4, v],
        [5, v],
        [6, 0],
      ],
    }
  })
  return { tracks, joints, rest, limits }
}

test('arm 1 作者入场/收回保持不变（误差 1e-5）', () => {
  const { tracks, joints, rest, limits } = armFixture(0.7)
  const old = tracks.map((tr) => ({ id: tr.id, points: tr.points.map((p) => [p[0], p[1]]) }))
  assert.equal(bindArmTracks(tracks, joints, rest, 1, 5, limits), true)
  for (const [i, tr] of tracks.entries()) {
    for (const t of [0, 0.5, 1, 5, 5.5, 6]) {
      assert.ok(Math.abs(armSample(tr.points, t) - armSample(old[i].points, t)) < 1e-5, `${tr.id} @${t}`)
    }
  }
})

test('arm 2 值域在 [-1,1] 内', () => {
  const { tracks, joints, rest, limits } = armFixture(0.7)
  bindArmTracks(tracks, joints, rest, 1, 5, limits)
  for (const tr of tracks) assert.ok(tr.points.every(([, v]) => v >= -1 && v <= 1))
})

test('arm 3 手势锚点不是通用角度：0.7 为正、-0.73 为负', () => {
  const a = armFixture(0.7)
  const b = armFixture(-0.73)
  bindArmTracks(a.tracks, a.joints, a.rest, 1, 5, a.limits)
  bindArmTracks(b.tracks, b.joints, b.rest, 1, 5, b.limits)
  assert.ok(armSample(a.tracks[1].points, 3) > 0)
  assert.ok(armSample(b.tracks[1].points, 3) < 0)
})

test('arm 4 上臂带动小臂，且 rest 不变', () => {
  const { tracks, joints, rest, limits } = armFixture(0.7)
  tracks[1].points = [[0, 0], [1, 0.7], [5, 0.7], [6, 0]]
  bindArmTracks(tracks, joints, rest, 1, 5, limits)
  assert.ok(armSample(tracks[1].points, 3) > 0.7)
  assert.ok(Math.abs(armSample(tracks[1].points, 2) - 0.7) < 1e-5)
})

test('arm 5 缺少 limits 时不改动并返回 false', () => {
  const { tracks, joints, rest } = armFixture(0.7)
  const before = JSON.stringify(tracks)
  assert.equal(bindArmTracks(tracks, joints, rest, 1, 5, {}), false)
  assert.equal(JSON.stringify(tracks), before)
})

// ---- gesture 编译
const armProfile = {
  allParameters: [
    { id: 'Param36', min: -1, max: 1, default: 0 },
    { id: 'Param39', min: -1, max: 1, default: 0 },
    { id: 'Param41', min: -1, max: 1, default: 0 },
    { id: 'Param42', min: -1, max: 1, default: 0 },
    { id: 'ParamEyeBallX', min: -1, max: 1, default: 0 },
    { id: 'ParamEyeBallY', min: -1, max: 1, default: 0 },
  ],
  primary: ['Param36', 'Param39', 'Param41', 'Param42', 'ParamEyeBallX', 'ParamEyeBallY'],
  physicsOutputIds: [],
}
const armIds = ['Param36', 'Param39', 'Param41', 'Param42']

test('gesture 正例：index_finger 与 grass 编译成功，四条臂轨道，末值回 rest', () => {
  for (const g of ['index_finger', 'grass']) {
    const ir = compilePlan(plan([{ kind: 'gesture', at: 0, gesture: g, duration: 3 }]), armProfile)
    for (const id of armIds) {
      const tr = ir.tracks.find((x) => x.id === id)
      assert.ok(tr, `${g} 应有 ${id}`)
      assert.equal(tr.points.at(-1)[1], 0, `${g} ${id} 末值应回 rest(0)`)
    }
    assert.equal(ir.tracks.filter((x) => armIds.includes(x.id)).length, 4)
    assert.equal(ir.steps[0].kind, 'gesture')
  }
  const idx = compilePlan(plan([{ kind: 'gesture', at: 0, gesture: 'index_finger' }]), armProfile)
  assert.ok(Math.abs(idx.tracks.find((x) => x.id === 'Param41').points.reduce((m, [, v]) => Math.max(m, v), 0) - 0.702) < 1e-3)
  const grass = compilePlan(plan([{ kind: 'gesture', at: 0, gesture: 'grass' }]), armProfile)
  assert.ok(Math.abs(grass.tracks.find((x) => x.id === 'Param41').points.reduce((m, [, v]) => Math.min(m, v), 0) + 0.732) < 1e-3)
})

test('gesture 反例：primary 缺 Param41 → 拒绝', () => {
  const bad = { ...armProfile, primary: armProfile.primary.filter((id) => id !== 'Param41') }
  assert.throws(() => compilePlan(plan([{ kind: 'gesture', gesture: 'grass' }]), bad), CompileError)
})

test('gesture 反例：与 look 同时控制 Param36 时间重叠 → 拒绝', () => {
  // look 只写眼珠，所以用 pose 同时写 Param36 才能真正冲突。
  assert.throws(
    () =>
      compilePlan(
        plan([
          { kind: 'gesture', at: 0, gesture: 'grass', duration: 3 },
          { kind: 'pose', at: 1, duration: 1, values: { Param36: 0.5 } },
        ]),
        armProfile,
      ),
    CompileError,
  )
})

test('gesture 反例：limits 缺失（allParameters 无 Param41）→ 不可用且 describeActions 不列 gesture', () => {
  const noLimit = { ...armProfile, allParameters: armProfile.allParameters.filter((p) => p.id !== 'Param41') }
  assert.throws(() => compilePlan(plan([{ kind: 'gesture', gesture: 'grass' }]), noLimit), CompileError)
  assert.ok(!describeActions(noLimit).includes('- gesture'))
})

test('gesture 反例：未知手势名 → 拒绝', () => {
  assert.throws(() => compilePlan(plan([{ kind: 'gesture', gesture: 'wave' }]), armProfile), CompileError)
})

test('gesture 越界裁剪有 warning', () => {
  const narrow = {
    ...armProfile,
    allParameters: armProfile.allParameters.map((p) => (p.id === 'Param41' ? { ...p, min: -0.5, max: 0.5 } : p)),
  }
  const ir = compilePlan(plan([{ kind: 'gesture', gesture: 'index_finger', strength: 1 }]), narrow)
  const tr = ir.tracks.find((x) => x.id === 'Param41')
  assert.ok(tr.points.every(([, v]) => v >= -0.5 && v <= 0.5))
  assert.ok(ir.warnings.some((w) => w.includes('Param41')))
})

test('describeActions 列出 gesture 且四条臂参数范围来自模型表', () => {
  const text = describeActions(armProfile)
  assert.ok(text.includes('- gesture'))
  assert.ok(text.includes('Param41∈[-1,1]'))
})

console.log(`\n${passed} passed`)
