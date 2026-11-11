/**
 * 规划器（主进程）：自然语言 → 语义动作计划 JSON → 经 compiler 校验。
 *
 * 只调一次模型生成计划；编译失败时把错误喂回模型重试一次（对照 jingyu planner.py）。
 * 模型输出按 JSON 解析，剥 ``` 围栏，拒绝 NaN/Infinity 这类非法值，只信 plan 本体。
 */
'use strict'

const { compilePlan, describeActions, CompileError } = require('../engine/compiler')

const MAX_ATTEMPTS = 2

function stripFence(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : raw
}

function parsePlanText(text) {
  const body = stripFence(text)
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new CompileError('模型没有返回 JSON 对象')
  // 拒绝 NaN / Infinity：JSON.parse 本身不接受，这里仅做显式提示
  if (/\b(NaN|Infinity)\b/.test(body.slice(start, end + 1))) {
    throw new CompileError('计划里含有 NaN/Infinity')
  }
  let parsed
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch (error) {
    throw new CompileError('计划 JSON 解析失败：' + error.message)
  }
  const plan = parsed && typeof parsed === 'object' && parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : parsed
  if (parsed && (parsed.refusal || parsed.unsupported)) {
    throw new CompileError('模型声明无法完成：' + String(parsed.refusal || parsed.unsupported).slice(0, 200))
  }
  return plan
}

function systemPrompt(profile) {
  return [
    '你是桌宠「大肥鱼」的动作编排器。把用户的自然语言要求，转成一份语义动作计划。',
    '只输出一个 JSON 对象，不要代码块，不要解释。格式：',
    '{"version":1,"intent":"用户意图一句话","summary":"动作概要一句话","actions":[{"kind":"look","at":0,"duration":1.2,"direction":"left","strength":0.8}]}',
    '规则：',
    '- actions 1 到 24 个；at 是相对开始的秒数（>=0），duration 是秒数；动作之间时间错开，不要同一时刻做两个动作。',
    '- 只能使用下面列出的 kind（列表即模型当前可用的全部动作），不要编造新动作；列表里没有的动作（例如模型不支持的部位）返回 {"unsupported":"原因"}。',
    '- strength 取 0 到 1。',
    '可用动作：',
    describeActions(profile),
  ].join('\n')
}

/**
 * text: 用户原话
 * profile: model-profile.buildProfile 的结果
 * callModel(messages, options) -> Promise<string>
 * 返回 { ir, plan, planner: { attempts, seconds } }，失败抛 Error。
 */
async function planChoreo({ text, profile, callModel }) {
  const started = Date.now()
  const messages = [
    { role: 'system', content: systemPrompt(profile) },
    { role: 'user', content: String(text || '').slice(0, 1000) },
  ]
  let lastError = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await callModel(messages, { temperature: 0.3, maxTokens: 900 })
    try {
      const plan = parsePlanText(raw)
      const ir = compilePlan(plan, profile)
      return {
        ir,
        plan,
        planner: { attempts: attempt, seconds: Math.round((Date.now() - started) / 100) / 10 },
      }
    } catch (error) {
      if (!(error instanceof CompileError) && !(error instanceof SyntaxError)) throw error
      lastError = error
      messages.push({ role: 'assistant', content: String(raw || '').slice(0, 1200) })
      messages.push({
        role: 'user',
        content: `本地校验未通过：${error.message}。请修正并仅返回完整 JSON 对象。`,
      })
    }
  }
  throw new Error('编舞计划生成失败：' + (lastError ? lastError.message : '未知错误'))
}

module.exports = { planChoreo, parsePlanText }
