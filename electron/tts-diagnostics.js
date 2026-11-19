'use strict'
const fs=require('node:fs')
const LANGS=['zh','ja','en','ko','yue']
function validateVoice(body){
 if(!body||!['system','gpt-sovits'].includes(body.engine)||typeof body.enabled!=='boolean')throw Error('请选择有效的语音方式')
 const out={engine:body.engine,enabled:body.enabled}
 if(body.lipSync!==undefined&&typeof body.lipSync!=='boolean')throw Error('口型开关格式无效')
 out.lipSync=body.lipSync!==false
 if(body.engine==='system'){out.voice=typeof body.voice==='string'?body.voice:'';out.sayLanguage='zh';return out}
 for(const k of ['url','refAudio','refText'])if(body[k]!==undefined){if(typeof body[k]!=='string'||body[k].length>(k==='refText'?2000:1000))throw Error('请检查语音配置长度');out[k]=body[k].trim()}
 if(out.url!==undefined){let u;try{u=new URL(out.url)}catch{throw Error('请填写有效的本地TTS地址')};if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('自定义语音请使用本机HTTP地址，如 http://127.0.0.1:9880/tts')}
 for(const k of ['refLang','sayLanguage'])if(body[k]!==undefined){if(!LANGS.includes(body[k]))throw Error('请选择支持的语言');out[k]=body[k]}
 return out
}
function validWav(audio){if(typeof audio!=='string'||audio.length>12*1024*1024)return false;const b=Buffer.from(audio,'base64');return b.length>44&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE'}
async function diagnose(tts,{voices,synthesize,fetchImpl=fetch,stat=fs.statSync}){
 const checks=[],add=(id,label,status,message)=>checks.push({id,label,status,message})
 if(tts.enabled===false){add('enabled','语音开关','fail','语音未启用，请打开并保存');return {ok:false,checks}}
 add('enabled','语音开关','pass','已启用')
 if(tts.engine==='system'){
  const list=await voices().catch(()=>[]);const found=tts.voice?list.some(v=>v.id===tts.voice):list.length>0
  add('voice','系统音色',found?'pass':'fail',found?(tts.voice||'系统默认音色可用'):'所选音色不可用，请刷新音色或安装Windows语音包')
  if(!found)return {ok:false,checks}
 }else{
  let url;try{url=new URL(tts.url);validateVoice({...tts,engine:'gpt-sovits',enabled:true})}catch(e){add('endpoint','服务地址','fail',e.message);return {ok:false,checks}}
  try{const r=await fetchImpl(new URL('/docs',url),{signal:AbortSignal.timeout(3500),redirect:'error'});add('service','本地服务',r.ok?'pass':'fail',r.ok?'服务可达，仍需试合成确认':'服务返回HTTP '+r.status)}catch{add('service','本地服务','fail','连接失败，请启动GPT-SoVITS并检查端口')}
  let exists=false;try{exists=!!tts.refAudio&&stat(tts.refAudio).isFile()}catch{}
  add('reference','参考音频',exists?'pass':'fail',exists?'本机文件存在':'请选择存在的参考音频文件')
  add('prompt','参考文字',tts.refText?'pass':'skip',tts.refText?'已填写参考音频对应文字':'未填写；部分模型允许无参考文字，合成结果以试合成为准')
  if(checks.some(c=>c.status==='fail')){add('synthesis','试合成','skip','先修复以上配置再检测');return {ok:false,checks}}
 }
 try{const lines={zh:'你好，语音检测已经完成。',ja:'こんにちは、音声の確認ができました。',en:'Hello, the voice check is complete.',ko:'안녕하세요. 음성 확인이 완료되었습니다.',yue:'你好，語音檢測已經完成。'};const audio=await synthesize(lines[tts.sayLanguage]||lines.zh,tts.sayLanguage||'zh');if(!validWav(audio))throw Error('返回音频不是有效WAV');add('synthesis','试合成','pass','已生成WAV音频；点击试听确认实际声音');return {ok:true,checks,audio}}
 catch{add('synthesis','试合成','fail',tts.engine==='system'?'系统合成失败，请更换音色后重试':'服务可达但合成失败，请检查模型、参考音频和语言配置');return {ok:false,checks}}
}
module.exports={validateVoice,diagnose,validWav}
