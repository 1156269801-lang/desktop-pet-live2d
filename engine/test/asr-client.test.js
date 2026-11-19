'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { transcribeAudio } = require('../../electron/asr-client')
const cfg = { enabled: true, url: 'http://127.0.0.1:8000/v1/audio/transcriptions', model: 'sensevoice', language: 'zh' }
const audio = { audio: Buffer.from('mock-audio').toString('base64'), mime: 'audio/webm;codecs=opus' }
test('multipart upload uses existing recording type and normalizes text', async () => {
  const text = await transcribeAudio(cfg, audio, async (url, opts) => {
    assert.equal(url.hostname, '127.0.0.1')
    assert.equal(opts.body.get('model'), 'sensevoice')
    assert.equal(opts.body.get('file').type, audio.mime)
    assert.equal(opts.redirect, 'error')
    return new Response(JSON.stringify({ text: ' 你好，大肥鱼。 ' }))
  })
  assert.equal(text, '你好，大肥鱼。')
})
test('disabled, oversized, invalid and nonlocal input never triggers fetch', async () => {
  const never = () => { throw new Error('unexpected request') }
  for (const [config, input] of [[{...cfg, enabled:false}, audio], [cfg, {...audio,audio:'?'}], [cfg,{...audio,mime:'text/html'}], [{...cfg,url:'https://example.com'},audio], [cfg,{...audio,audio:''}]]) {
    await assert.rejects(transcribeAudio(config,input,never))
  }
})
test('provider errors do not echo service response contents', async () => {
  await assert.rejects(transcribeAudio(cfg,audio,async()=>new Response('PRIVATE',{status:500})), /HTTP 500/)
  await assert.rejects(transcribeAudio(cfg,audio,async()=>new Response('',{status:429})), /正忙/)
})
test('silence and structured non-text results are not sent to chat', async () => {
  await assert.rejects(transcribeAudio(cfg,audio,async()=>new Response('{"text":""}')), /没有识别/)
  await assert.rejects(transcribeAudio(cfg,audio,async()=>new Response('{"result":{}}')), /没有文字/)
})
test('timeout and offline service have actionable messages', async () => {
  await assert.rejects(transcribeAudio(cfg,audio,async()=>{const e=new Error();e.name='TimeoutError';throw e}), /超时/)
  await assert.rejects(transcribeAudio(cfg,audio,async()=>{throw new Error('offline')}), /启动语音识别/)
})
