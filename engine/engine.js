/**
 * 编舞引擎（渲染进程）：IR 轨道 → 逐帧参数值。
 *
 * 只负责"按时间采样并给出参数值"，不直接碰模型。pet.js 在 onBeforePhysics 里
 * 调 apply(setParam)，因此编舞写入发生在物理与待机/注视之后，编舞期间覆盖
 * 对同一参数的待机摆动（互斥），播完后这些参数交还给待机层。
 *
 * 采样复用 engine/sampler.js（与主进程 compiler 同一份实现）。
 */
(function (root) {
  'use strict'

  const Sampler = root.PetSampler
  if (!Sampler) throw new Error('PetSampler 未加载（先加载 /engine/sampler.js）')

  class ChoreoEngine {
    constructor() {
      this.job = null
      this.elapsed = 0
      this.lastValues = new Map()
    }

    get active() {
      return this.job !== null
    }

    /** ir: compiler.compilePlan 的结果。新计划会替换正在播放的计划。 */
    start(ir, id) {
      if (!ir || !Array.isArray(ir.tracks)) throw new Error('无效的编舞 IR')
      this.job = { id: id || String(Date.now()), ir }
      this.elapsed = 0
      this.lastValues = new Map()
    }

    stop() {
      this.job = null
      this.elapsed = 0
      this.lastValues = new Map()
    }

    /** 推进时间。播完返回 'completed'（只返回一次），否则返回 null。 */
    tick(deltaMs) {
      if (!this.job) return null
      this.elapsed += Math.max(0, deltaMs) / 1000
      if (this.elapsed >= this.job.ir.duration) {
        const finished = this.job
        this.stop()
        return { id: finished.id, status: 'completed' }
      }
      return null
    }

    /** 当前时刻每个活动参数的目标值（只含时间窗口内的轨道）。 */
    valuesAt(t) {
      const values = new Map()
      for (const track of this.job ? this.job.ir.tracks : []) {
        const end = track.start + track.duration
        // 轨道窗口外不写：播完后参数交还给待机层，关键点末值即为基准值，衔接平滑
        if (t < track.start || t > end) continue
        const local = t - track.start
        values.set(track.id, Sampler.samplePoints(track.points, local))
      }
      return values
    }

    /** 在每帧物理之后调用：setParam(id, value) 由 pet.js 提供。 */
    apply(setParam) {
      if (!this.job) return
      const values = this.valuesAt(this.elapsed)
      for (const [id, value] of values) setParam(id, value)
      this.lastValues = values
    }
  }

  root.PetEngine = { ChoreoEngine }
})(typeof globalThis !== 'undefined' ? globalThis : window)
