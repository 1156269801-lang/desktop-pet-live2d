'use strict'
const fs=require('node:fs')
const path=require('node:path')
const {execFile}=require('node:child_process')
const systemTts=require('./system-tts')
async function probe(url,expected){try{const r=await fetch(url,{signal:AbortSignal.timeout(2500),redirect:'error'});if(!r.ok)return false;const data=await r.json();return expected(data)}catch{return false}}
function createQuickSetup({root,config,director,saveConfig,synthesize}){
 let starting=null
 const ttsLauncher=require('./tts-launcher').createTtsLauncher({root,config})
 async function state(){
  const api=director.state()
  const voices=await systemTts.voices().catch(()=>[])
  const asrReady=await probe('http://127.0.0.1:8000/health',x=>x.ok===true&&x.service==='desktop-pet-asr')
  const engine=config.tts?.engine||'gpt-sovits'
  let ttsReady=engine==='system'&&voices.length>0
  if(engine==='gpt-sovits'){
   try{const u=new URL(config.tts?.url||'http://127.0.0.1:9880/tts'); if(['127.0.0.1','localhost'].includes(u.hostname)){const r=await fetch(new URL('/docs',u),{signal:AbortSignal.timeout(2500),redirect:'error'});ttsReady=r.ok}}catch{}
  }
  return {ok:true,api:{configured:!!(api.hasKey&&api.config.enabled&&api.config.allowRemote),baseURL:api.config.baseURL,model:api.config.model},asr:{ready:asrReady,installed:fs.existsSync(path.join(root,'_asr/venv/Scripts/python.exe'))},tts:{presets:require('./voice-presets').presets(root),preset:config.tts?.preset||'custom',installed:ttsLauncher.installation().installed,engine,enabled:config.tts?.enabled!==false,ready:ttsReady,voice:config.tts?.voice||'',url:config.tts?.url||'http://127.0.0.1:9880/tts',refAudio:config.tts?.refAudio||'',refText:config.tts?.refText||'',refLang:config.tts?.refLang||'ja',sayLanguage:config.tts?.sayLanguage||'zh',lipSync:config.tts?.lipSync!==false,voices}}
 }
 async function startAsr(){
  if(starting)return starting
  starting=new Promise(resolve=>{
   execFile(path.join(root,'_asr/venv/Scripts/python.exe'),[path.join(root,'asr/manage.py'),'start'],{windowsHide:true,timeout:60000,maxBuffer:32000},err=>resolve(err?{ok:false,error:'语音识别启动失败，请检查本机安装或日志'}:{ok:true}))
  }).finally(()=>{starting=null})
  return starting
 }
 async function saveVoice(body){
  let validated
  try{validated=require('./tts-diagnostics').validateVoice(body)}catch(e){return {ok:false,error:e.message}}
  if(body.engine==='gpt-sovits'&&body.preset&&body.preset!=='custom'){
   const selected=require('./voice-presets').presets(root).find(p=>p.id===body.preset)
   if(!selected?.installed)return {ok:false,error:'所选音色模型未安装'}
   for(const key of ['url','refAudio','refText','refLang','sayLanguage','inferConfig'])validated[key]=selected[key]
   validated.preset=selected.id
  }else{validated.preset='custom';validated.inferConfig=''}
  const voices=body.engine==='system'?await systemTts.voices().catch(()=>[]):[]
  if(body.engine==='system'&&!voices.length)return {ok:false,error:'未找到系统语音，请在Windows中添加语音包'}
  if(body.engine==='system'&&body.voice&&!voices.some(v=>v.id===body.voice))return {ok:false,error:'所选系统音色不存在，请刷新'}
  const previous=config.tts
  config.tts={...previous,...validated}
  try{await saveConfig();return {ok:true}}catch{config.tts=previous;return {ok:false,error:'语音设置保存失败，请重试'}}
 }
 async function testVoice(){try{if(config.tts?.enabled===false)return {ok:false,error:'先启用并保存语音'};const lang=config.tts?.sayLanguage||'zh';const lines={zh:'你好，我已经准备好和你聊天了。',ja:'こんにちは、お話しする準備ができました。',en:'Hello, I am ready to chat.',ko:'안녕하세요. 이야기할 준비가 되었습니다.',yue:'你好，我已經準備好同你傾偈。'};const audio=await synthesize(lines[lang]||lines.zh,lang);return audio?{ok:true,audio}:{ok:false,error:'没有生成语音，请检查语音设置'}}catch{return {ok:false,error:'试听失败：系统语音请检查语音包；自定义语音请检查本地TTS服务和参考音频'}}}
 let detecting=null
 function detectVoice(){if(!detecting)detecting=require('./tts-diagnostics').diagnose({...config.tts},{voices:systemTts.voices,synthesize}).finally(()=>{detecting=null});return detecting}
 return {state,startAsr,saveVoice,testVoice,detectVoice,startTts:ttsLauncher.start}
}
module.exports={createQuickSetup}
