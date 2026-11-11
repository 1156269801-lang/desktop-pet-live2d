/**
 * 模型能力目录（主进程，角色切换后按需重建）。
 *
 * 参数范围来自渲染进程的 CubismCore 参数表（capabilities.params），
 * 不要用 cdi3.json 的 Min/Max（那里是空的）。
 * 物理输出从 physics3.json 读取，作者物理参数一律只读。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

// P0：Agent 可写的语义参数（物理输入侧 + 眼珠）。
// 注意：AngleX/Y/Z、PositionX/Y/Z 是 physics3.json 的 Input.Source（可写方向盘），
// 经物理模拟驱动 ParamAngleX/Y/Z、ParamBodyAngleX/Y/Z（输出侧，只读仪表盘）。
// 直接写输出侧参数每帧会被物理覆盖，等于没写，因此这里只能列输入侧。
// P1 再扩展手势关节、表情等。
const PRIMARY_IDS = [
  'AngleX',
  'AngleY',
  'AngleZ',
  'PositionX',
  'PositionY',
  'PositionZ',
  'ParamEyeBallX',
  'ParamEyeBallY',
  // 右臂手势用（jingyu 手臂联动改编）：已核实非 physics3 输出，可作输入侧写入。
  'Param36',
  'Param39',
  'Param41',
  'Param42',
]

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

/**
 * modelPath: 绝对路径，指向 *.model3.json
 * parameterTable: [{id, min, max, default}]，来自渲染进程 getParameterTable()
 */
function buildProfile({ modelPath, parameterTable }) {
  const modelDir = path.dirname(modelPath)
  const model = readJson(modelPath)
  const refs = model.FileReferences || {}

  const physicsOutputIds = []
  if (refs.Physics) {
    const physics = readJson(path.join(modelDir, refs.Physics))
    for (const setting of physics.PhysicsSettings || []) {
      for (const output of setting.Output || []) {
        if (output.Destination && output.Destination.Id) physicsOutputIds.push(output.Destination.Id)
      }
    }
  }
  const physicsSet = new Set(physicsOutputIds)

  const allParameters = (Array.isArray(parameterTable) ? parameterTable : [])
    .filter((p) => p && typeof p.id === 'string' && Number.isFinite(p.min) && Number.isFinite(p.max) && p.min <= p.max)
    .map((p) => ({
      id: p.id,
      min: p.min,
      max: p.max,
      default: Number.isFinite(p.default) ? p.default : 0,
    }))
  if (allParameters.length === 0) throw new Error('参数表为空，无法生成能力目录')

  const known = new Set(allParameters.map((p) => p.id))
  const primary = PRIMARY_IDS.filter((id) => known.has(id) && !physicsSet.has(id))

  const nativeMotions = Object.entries(refs.Motions || {}).flatMap(([group, list]) =>
    (Array.isArray(list) ? list : []).map((item, index) => ({ group, index, file: item.File })),
  )
  const expressions = (refs.Expressions || []).map((item) => item.Name)

  return {
    modelFile: path.basename(modelPath),
    allParameters,
    primary,
    physicsOutputIds: [...physicsSet],
    nativeMotions,
    expressions,
  }
}

module.exports = { buildProfile, PRIMARY_IDS }
