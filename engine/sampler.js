/**
 * 采样器：主进程（compiler）与渲染进程（engine）共用的唯一缓动实现。
 *
 * 数学照 jingyu-live2d-agent 的 compiler.py（samplePoints / sampleMotion）与
 * web/engine.mjs 对照移植，金样测试见 engine/test/choreo.test.js。
 * 同时支持 CommonJS（node 测试 / 主进程）与浏览器全局（window.PetSampler）。
 */
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PetSampler = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  /** 平滑步进：u ∈ [0,1] → 3u²-2u³ */
  function smooth(u) {
    return u * u * (3 - 2 * u)
  }

  /**
   * 关键点分段平滑插值。points = [[t, value], ...]，t 单调递增。
   * t 早于首点返回首值，晚于末点返回末值。
   */
  function samplePoints(points, t) {
    if (t <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i += 1) {
      if (t <= points[i][0]) {
        const [a, x] = points[i - 1]
        const [b, y] = points[i]
        return x + (y - x) * smooth(clamp((t - a) / Math.max(1e-8, b - a), 0, 1))
      }
    }
    return points[points.length - 1][1]
  }

  function cubic(a, b, c, d, t) {
    return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
  }

  /**
   * Cubism motion3 风格的分段曲线：[t0, v0, kind, ...segments]。
   * kind 0 = 线性，1 = 贝塞尔（带两个控制点），2 = 阶跃保持前值，3 = 阶跃到终值。
   */
  function sampleMotion(segments, t) {
    let prev = [segments[0], segments[1]]
    let i = 2
    while (i < segments.length) {
      const kind = Number(segments[i])
      i += 1
      let c1
      let c2
      let end
      if (kind === 1) {
        c1 = segments.slice(i, i + 2)
        c2 = segments.slice(i + 2, i + 4)
        end = segments.slice(i + 4, i + 6)
        i += 6
      } else {
        end = segments.slice(i, i + 2)
        i += 2
      }
      if (t <= end[0]) {
        if (kind === 0) {
          return prev[1] + (end[1] - prev[1]) * clamp((t - prev[0]) / Math.max(1e-8, end[0] - prev[0]), 0, 1)
        }
        if (kind === 2) return prev[1]
        if (kind === 3) return end[1]
        let lo = 0
        let hi = 1
        for (let k = 0; k < 18; k += 1) {
          const u = (lo + hi) / 2
          if (cubic(prev[0], c1[0], c2[0], end[0], u) < t) lo = u
          else hi = u
        }
        return cubic(prev[1], c1[1], c2[1], end[1], (lo + hi) / 2)
      }
      prev = end
    }
    return prev[1]
  }

  return { smooth, samplePoints, sampleMotion }
})
