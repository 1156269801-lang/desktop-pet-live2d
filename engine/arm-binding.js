/**
 * 右臂手势的保守二维联动（jingyu arm_binding.py 的 JS 移植）。
 *
 * 原文：D:\大肥鱼桌宠归档\02-文档\jingyu参考源码\arm_binding.py（48 行）
 *       D:\大肥鱼桌宠归档\02-文档\jingyu参考源码\arm-binding.md
 *
 * 与 jingyu 的关系（必读）：
 * - jingyu 的 bind 作用于「作者已有曲线」。本项目没有作者曲线，compiler 用
 *   入场 → 保持 → 收回 三段合成四条轨道，再调用 bindArmTracks 改写保持段。
 *   这是对 jingyu 的改编，不是逐字等价。
 * - 算法是相对 rest（手势锚点）的二维参数约束，不是骨骼 IK，不保证手掌到达某点。
 * - 插值复用 engine/sampler.js 的 samplePoints / smooth（与 jingyu sample 同为 smoothstep）。
 *
 * 参数映射（已核实）：upperArm=Param36，forearm=Param41，wrist=Param42，perspective=Param39。
 * 这四个参数不是 physics3 输出，可作输入侧写入。
 */
'use strict'

const { samplePoints, smooth } = require('./sampler')

const ARM_JOINTS = { upperArm: 'Param36', forearm: 'Param41', wrist: 'Param42', perspective: 'Param39' }
const ARM_KEYS = ['upperArm', 'forearm', 'wrist', 'perspective']

// 手势锚点 = 作者进入动作末帧的 rest 值（已核实）。
// 只有 forearm 有 jingyu 对照（0.702 / -0.732，与 arm-binding.md 一致）。
// upperArm / wrist / perspective 的数值来自本项目实测末帧；wrist 与 perspective 的
// 联动系数（py L30-37）无 jingyu 对照之外的验证，属于沿用原算法的自选。
const GESTURE_POSES = {
  // 竖食指：36=0.0，41=0.702，42=0，39=0.322
  index_finger: { upperArm: 0.0, forearm: 0.702, wrist: 0, perspective: 0.322 },
  // 拿草：36=0.04，41=-0.732，42=0，39=0.2
  grass: { upperArm: 0.04, forearm: -0.732, wrist: 0, perspective: 0.2 },
}

// py L23-24：保持段按 45 Hz 取样，与其它轨道共享时间戳。
const SAMPLE_HZ = 45

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
// py round(x, n)：JS 的 toFixed 与 Python round 在边界上有极少数不同，对本算法可忽略。
const round = (v, digits) => Number(v.toFixed(digits))

/**
 * 只改写 (start, end) 保持段，保留作者进入/收回关键帧。
 *
 * tracks: [{id, points: [[t, v], ...]}]，会被原地修改（与 py 一致）。
 * joints: {upperArm, forearm, wrist, perspective} → 轨道 id。
 * rest:   {upperArm, forearm, wrist, perspective} → 手势锚点。
 * limits: {轨道 id → {min, max}}，必须来自模型参数表；缺失则返回 false 且不改动。
 * 返回：是否有数值被改动（py 的 changed）。
 */
function bindArmTracks(tracks, joints, rest, start, end, limits) {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  if (ARM_KEYS.some((k) => !byId.has(joints[k]) || !limits || !limits[joints[k]])) return false

  const original = {}
  for (const k of ARM_KEYS) original[k] = byId.get(joints[k]).points.map(([t, v]) => [t, v])

  // py L21-24：共享时间戳，防止单独关键帧在插值中漂移。
  const times = new Set([round(start, 5), round(end, 5)])
  for (const k of ARM_KEYS) {
    for (const [t] of original[k]) if (start < t && t < end) times.add(t)
  }
  const count = Math.max(1, Math.ceil((end - start) * SAMPLE_HZ))
  for (let i = 0; i <= count; i += 1) times.add(round(start + ((end - start) * i) / count, 5))

  const output = { upperArm: [], forearm: [], wrist: [], perspective: [] }
  let changed = false
  for (const t of [...times].sort((a, b) => a - b)) {
    const raw = {}
    const delta = {}
    for (const k of ARM_KEYS) {
      raw[k] = samplePoints(original[k], t)
      delta[k] = raw[k] - rest[k]
    }
    // 相对手势锚点工作：大臂带动小臂（py L30）。
    const upper = clamp(delta.upperArm + 0.18 * delta.forearm, -0.42, 0.42)
    // 透视限幅（py L31）。
    const perspective = clamp(delta.perspective, -0.22, 0.22)
    // 小臂对大臂的少量补偿（py L32）。
    const center = 0.45 * upper
    // 透视越大，小臂允许偏移越小（py L33）。
    const allowance = 0.32 * (1 - 0.35 * Math.min(1, Math.abs(perspective) / 0.22))
    const residual = clamp(delta.forearm, -allowance, allowance) // py L34
    const forearm = center + residual // py L35
    // 手腕反向补偿（py L36）。
    const wrist = clamp(delta.wrist - 0.2 * forearm, -0.38, 0.38)
    const desired = { upperArm: upper, forearm, wrist, perspective }
    // 保持段两端 0.25 秒内淡入淡出，保证与作者进入/收回平滑衔接（py L38）。
    const edge = smooth(clamp(Math.min(t - start, end - t) / 0.25, 0, 1))
    for (const k of ARM_KEYS) {
      let value = raw[k] + (rest[k] + desired[k] - raw[k]) * edge // py L40
      const p = limits[joints[k]]
      value = clamp(value, p.min, p.max) // py L41：范围来自模型参数表
      changed = changed || Math.abs(value - raw[k]) > 1e-5 // py L42
      output[k].push([t, round(value, 6)]) // py L43
    }
  }

  for (const k of ARM_KEYS) {
    const tr = byId.get(joints[k])
    tr.points = [
      ...original[k].filter(([t]) => t < start),
      ...output[k],
      ...original[k].filter(([t]) => t > end),
    ] // py L46
    tr.armBinding = 'gesture-relative-v1' // py L47
  }
  return changed
}

module.exports = {
  bindArmTracks,
  sample: samplePoints,
  ARM_JOINTS,
  ARM_KEYS,
  GESTURE_POSES,
  SAMPLE_HZ,
}
