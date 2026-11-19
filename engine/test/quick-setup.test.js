'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createQuickSetup}=require('../../electron/quick-setup')
function setup(save){const config={tts:{engine:'gpt-sovits',enabled:false,url:'http://127.0.0.1:9880/tts'}};return {config,q:createQuickSetup({root:process.cwd(),config,director:{state:()=>({hasKey:false,config:{}})},saveConfig:save||(()=>{}),synthesize:async()=>'UklGRg=='})}}
test('invalid voice configuration does not mutate config',async()=>{const {config,q}=setup();const before=JSON.stringify(config);assert.equal((await q.saveVoice({engine:'unknown',enabled:true})).ok,false);assert.equal(JSON.stringify(config),before)})
test('voice persistence failure rolls back runtime configuration',async()=>{const {config,q}=setup(()=>{throw Error('disk')});const before=JSON.stringify(config);assert.equal((await q.saveVoice({engine:'gpt-sovits',enabled:true})).ok,false);assert.equal(JSON.stringify(config),before)})
test('disabled voice test does not synthesize',async()=>{const {q}=setup();assert.equal((await q.testVoice()).ok,false)})
test('custom voice selection retains existing endpoint and confirms save',async()=>{const {config,q}=setup();assert.equal((await q.saveVoice({engine:'gpt-sovits',enabled:true})).ok,true);assert.equal(config.tts.url,'http://127.0.0.1:9880/tts');assert.equal(config.tts.lipSync,true)})
