'use strict'
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process')
function createTtsLauncher({root,config,fetchImpl=fetch}){
 let pending=null
 function installation(){const dir=config.tts?.installDir||'D:/GPT-SoVITS';const python=config.tts?.pythonPath||path.join(process.env.LOCALAPPDATA||'','Programs/Python/Python312/python.exe');return {dir,python,installed:fs.existsSync(path.join(dir,'api_v2.py'))&&fs.existsSync(python)}}
 async function ready(url){try{const r=await fetchImpl(new URL('/openapi.json',url),{signal:AbortSignal.timeout(2000),redirect:'error'});const j=await r.json();return r.ok&&!!j.paths?.['/tts']}catch{return false}}
 async function run(){
  const i=installation();let url
  try{url=new URL(config.tts?.url||'http://127.0.0.1:9880/tts')}catch{return {ok:false,error:'请先保存有效的本地TTS地址'}}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))return {ok:false,error:'一键启动仅支持本机HTTP服务'}
  if(await ready(url))return {ok:true,reused:true,ready:true}
  if(!i.installed)return {ok:false,error:'未找到GPT-SoVITS或Python环境，请确认安装目录'}
  const port=Number(url.port||80)
  const occupied=await new Promise(resolve=>{const socket=net.connect({host:url.hostname,port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false)})})
  if(occupied)return {ok:false,error:'该端口已被其他服务占用，请检查服务地址；没有停止任何现有程序'}
  const logDir=path.join(root,'_tts');fs.mkdirSync(logDir,{recursive:true});const fd=fs.openSync(path.join(logDir,'service.log'),'a')
  let child
  try{child=spawn(i.python,['-u',path.join(i.dir,'api_v2.py'),'-a','127.0.0.1','-p',String(port),'-c',config.tts?.inferConfig||path.join(i.dir,'GPT_SoVITS/configs/tts_infer.yaml')],{cwd:i.dir,windowsHide:true,detached:true,stdio:['ignore',fd,fd],env:{...process.env,PYTHONIOENCODING:'utf-8',PATH:i.dir+';'+process.env.PATH}})}finally{fs.closeSync(fd)}
  let exited=false,failed=false;child.once('exit',()=>{exited=true});child.once('error',()=>{failed=true});child.unref()
  fs.writeFileSync(path.join(logDir,'service.json'),JSON.stringify({pid:child.pid,startedAt:new Date().toISOString(),installDir:i.dir,port}))
  for(let n=0;n<90;n++){if(await ready(url))return {ok:true,ready:true};if(exited||failed)return {ok:false,error:'TTS启动失败，详情见 _tts/service.log'};await new Promise(r=>setTimeout(r,1000))}
  return {ok:false,starting:true,error:'模型仍在加载，请稍后刷新状态；详情见 _tts/service.log'}
 }
 function start(){if(!pending)pending=run().finally(()=>{pending=null});return pending}
 return {start,installation}
}
module.exports={createTtsLauncher}
