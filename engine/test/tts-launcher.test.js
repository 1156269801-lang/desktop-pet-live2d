'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createTtsLauncher}=require('../../electron/tts-launcher')
test('reuses verified local tts API without spawning',async()=>{const l=createTtsLauncher({root:process.cwd(),config:{tts:{url:'http://127.0.0.1:9880/tts'}},fetchImpl:async()=>({ok:true,json:async()=>({paths:{'/tts':{}}})})});assert.equal((await l.start()).reused,true)})
test('rejects remote launch target',async()=>{const l=createTtsLauncher({root:process.cwd(),config:{tts:{url:'https://example.com/tts'}}});assert.equal((await l.start()).ok,false)})
