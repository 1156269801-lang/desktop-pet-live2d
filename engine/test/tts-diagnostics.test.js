'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {validateVoice,diagnose}=require('../../electron/tts-diagnostics')
const bytes=Buffer.alloc(48);bytes.write('RIFF');bytes.write('WAVE',8);const audio=bytes.toString('base64')
const deps={voices:async()=>[{id:'voice'}],synthesize:async()=>audio,fetchImpl:async()=>({ok:true}),stat:()=>({isFile:()=>true})}
test('validates visual fields and blocks nonlocal endpoint',()=>{assert.equal(validateVoice({engine:'gpt-sovits',enabled:true,url:'http://127.0.0.1:9880/tts',refText:'hello',sayLanguage:'ja',lipSync:false}).lipSync,false);assert.throws(()=>validateVoice({engine:'gpt-sovits',enabled:true,url:'https://example.com/tts'}));assert.throws(()=>validateVoice({engine:'gpt-sovits',enabled:true,refLang:'invalid'}))})
test('system diagnostics returns actual WAV with per-item success',async()=>{const r=await diagnose({engine:'system',enabled:true,voice:'voice'},deps);assert.equal(r.ok,true);assert.equal(r.audio,audio);assert.equal(r.checks.at(-1).status,'pass')})
test('HTTP success alone is not synthesis success',async()=>{const r=await diagnose({engine:'gpt-sovits',enabled:true,url:'http://127.0.0.1:9880/tts',refAudio:'ref.wav'}, {...deps,synthesize:async()=>Buffer.from('not wav').toString('base64')});assert.equal(r.ok,false);assert.equal(r.checks.at(-1).status,'fail')})
test('missing reference skips synthesis',async()=>{let called=false;const r=await diagnose({engine:'gpt-sovits',enabled:true,url:'http://127.0.0.1:9880/tts',refAudio:''},{...deps,synthesize:async()=>{called=true}});assert.equal(r.ok,false);assert.equal(called,false);assert.equal(r.checks.at(-1).status,'skip')})
test('disabled voice and unavailable voice fail without speaking',async()=>{assert.equal((await diagnose({enabled:false},deps)).ok,false);assert.equal((await diagnose({engine:'system',enabled:true,voice:'missing'},deps)).ok,false)})
