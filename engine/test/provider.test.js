/**
 * 模型接入测试：连接测试的结果分类、模型列表、请求失败原因、宽松 JSON 解析。
 * 全部用假的 fetch，不联网。
 * 运行：node engine/test/provider.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const { testConnection, requestPlan, classifyStatus, PROVIDER_MESSAGES } = require('../../electron/director-provider')

let passed = 0
async function test(name, fn) {
  await fn()
  passed += 1
  console.log('ok -', name)
}

const KEY = 'sk-test-0123456789'
const config = { enabled: true, allowRemote: true, baseURL: 'https://api.example.com/v1', model: 'good-model', tokenizerProfile: 'conservative', contextTokens: 32768 }

function response(status, body) {
  const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  let sent = false
  return {
    ok: status >= 200 && status < 300, status,
    body: {
      cancel: async () => {},
      getReader: () => ({ read: async () => (sent ? { done: true } : (sent = true, { done: false, value: bytes })), cancel: async () => {} }),
    },
  }
}
/** routes: { 'POST /chat/completions': fn(init) => response, 'GET /models': ... } */
function fakeFetch(routes, calls = []) {
  return async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/v1/, '')
    calls.push({ method: init.method, path, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : null })
    const handler = routes[init.method + ' ' + path]
    if (!handler) throw new TypeError('fetch failed')
    return handler(init)
  }
}
const chatOk = () => response(200, { choices: [{ message: { content: 'pong' } }] })

async function main() {
  await test('状态码分类', () => {
    assert.deepEqual([401, 403, 402, 404, 400, 422, 429, 500, 503, 418].map(classifyStatus),
      ['auth', 'auth', 'balance', 'not-found', 'bad-request', 'bad-request', 'rate', 'server', 'server', 'status'])
    for (const code of ['auth', 'balance', 'not-found', 'bad-request', 'rate', 'server', 'status', 'network', 'timeout', 'format']) assert.ok(PROVIDER_MESSAGES[code])
  })

  await test('连接测试成功：只发一条极短请求，带密钥', async () => {
    const calls = []
    const result = await testConnection({ config, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': chatOk }, calls) })
    assert.deepEqual(result, { ok: true, code: 'ok' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].auth, 'Bearer ' + KEY)
    assert.equal(calls[0].body.model, 'good-model')
    assert.ok(calls[0].body.max_tokens <= 16 && calls[0].body.messages.length === 1)
  })

  await test('密钥错误、余额不足、限流、服务端错误各自归类，且不去读模型列表', async () => {
    for (const [status, code] of [[401, 'auth'], [402, 'balance'], [429, 'rate'], [502, 'server']]) {
      const calls = []
      const result = await testConnection({ config, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': () => response(status, { error: 'secret detail' }) }, calls) })
      assert.deepEqual(result, { ok: false, code })
      assert.equal(calls.length, 1)
    }
  })

  await test('模型名不对：附上这个地址可用的模型，过滤掉不像模型名的内容', async () => {
    const routes = {
      'POST /chat/completions': () => response(404, {}),
      'GET /models': () => response(200, { data: [{ id: 'good-model' }, { id: 'other-model' }, { id: 'good-model' }, { id: '<script>' }, { id: 42 }, { id: 'x' + KEY }, {}] }),
    }
    const result = await testConnection({ config: { ...config, model: 'typo' }, key: KEY, fetchImpl: fakeFetch(routes) })
    assert.deepEqual(result, { ok: false, code: 'not-found', models: ['good-model', 'other-model'] })
    // 读不到模型列表时不带 models 字段
    const bare = await testConnection({ config, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': () => response(400, {}) }) })
    assert.deepEqual(bare, { ok: false, code: 'bad-request' })
  })

  await test('连不上、超时、格式不对', async () => {
    assert.deepEqual(await testConnection({ config, key: KEY, fetchImpl: fakeFetch({}) }), { ok: false, code: 'network' })
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    assert.deepEqual(await testConnection({ config, key: KEY, fetchImpl: hang, timeoutMs: 20 }), { ok: false, code: 'timeout' })
    assert.deepEqual(await testConnection({ config, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': () => response(200, '<html>login</html>') }) }), { ok: false, code: 'format' })
    assert.deepEqual(await testConnection({ config, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': () => response(200, { hello: 1 }) }) }), { ok: false, code: 'format' })
  })

  await test('缺密钥、地址无效、缺模型时不发请求', async () => {
    const never = async () => { throw new Error('不应该发请求') }
    assert.deepEqual(await testConnection({ config, key: '', fetchImpl: never }), { ok: false, code: 'no-key' })
    assert.deepEqual(await testConnection({ config, key: null, fetchImpl: never }), { ok: false, code: 'no-key' })
    assert.deepEqual(await testConnection({ config: { ...config, baseURL: 'http://example.com' }, key: KEY, fetchImpl: never }), { ok: false, code: 'address' })
    assert.deepEqual(await testConnection({ config: { ...config, baseURL: 'https://user:pw@example.com' }, key: KEY, fetchImpl: never }), { ok: false, code: 'address' })
    assert.deepEqual(await testConnection({ config: { ...config, model: ' ' }, key: KEY, fetchImpl: never }), { ok: false, code: 'model' })
    // 本机 http 允许
    assert.equal((await testConnection({ config: { ...config, baseURL: 'http://127.0.0.1:1234' }, key: KEY, fetchImpl: fakeFetch({ 'POST /chat/completions': chatOk }) })).ok, true)
  })

  const plan = { version: 1, characterRevision: 'r1', speech: '好呀', cues: [] }
  const ask = (routes) => requestPlan({ config, key: KEY, prompt: '系统提示', text: '你好', fetchImpl: fakeFetch(routes) })
  const reply = (content) => ({ 'POST /chat/completions': () => response(200, { choices: [{ message: { content } }] }) })

  await test('聊天请求：标准 JSON、代码块包裹、前后带说明文字都能解析', async () => {
    assert.deepEqual(await ask(reply(JSON.stringify(plan))), plan)
    assert.deepEqual(await ask(reply('```json\n' + JSON.stringify(plan) + '\n```')), plan)
    assert.deepEqual(await ask(reply('好的，下面是计划：\n' + JSON.stringify(plan) + '\n希望有帮助。')), plan)
  })

  await test('聊天请求失败时给出具体原因，不回显服务商响应', async () => {
    const codeOf = async (routes) => { try { await ask(routes); return 'no-error' } catch (error) { return [error.providerCode, error.message] } }
    for (const [status, code] of [[401, 'auth'], [404, 'not-found'], [402, 'balance'], [429, 'rate'], [500, 'server']]) {
      const [got, message] = await codeOf({ 'POST /chat/completions': () => response(status, { error: { message: 'PROVIDER-SECRET-DETAIL' } }) })
      assert.equal(got, code)
      assert.equal(message, PROVIDER_MESSAGES[code])
      assert.ok(!message.includes('PROVIDER-SECRET-DETAIL'))
    }
    assert.equal((await codeOf({}))[0], 'network')
    assert.equal((await codeOf(reply('完全不是 JSON')))[0], 'format')
    // 回显密钥的响应仍被拒绝
    assert.equal((await codeOf(reply(JSON.stringify({ ...plan, speech: KEY }))))[0], 'format')
  })

  await test('未启用或未授权时聊天请求不发出', async () => {
    const never = async () => { throw new Error('不应该发请求') }
    for (const off of [{ enabled: false }, { allowRemote: false }]) {
      await assert.rejects(requestPlan({ config: { ...config, ...off }, key: KEY, prompt: 'p', text: 't', fetchImpl: never }), /尚未启用并授权/)
    }
  })

  console.log('\n' + passed + ' passed')
}

main().catch((error) => { console.error(error); process.exit(1) })
