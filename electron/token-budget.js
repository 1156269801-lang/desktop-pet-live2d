'use strict'
// Whole messages budget. No runtime downloads, prompt logging, truncation or billing claims.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const CONTEXT_MIN=4096,CONTEXT_MAX=1048576,DEFAULT_CONTEXT_TOKENS=32768,DEFAULT_OUTPUT_TOKENS=1800
const ENVELOPE_RESERVE=512,TEXT_MAX_BYTES=64*1024,IMAGE_MAX_BYTES=4*1024*1024,IMAGE_RESERVE=16384
const ASSETS=Object.freeze([
  {file:path.join(__dirname,'vendor','tokenizers','tokenizers.cjs'),bytes:100034,sha256:'fab81302e9d4ebf2c7aec310e35af0df81c28cb1ef7a4ac44ac83848e39ae79c'},
  {file:path.join(__dirname,'..','assets','tokenizers','deepseek-v4','tokenizer.json'),bytes:6367096,sha256:'89085f12ef79460ac5f66d1119325ddfc694b4ab209d80bbd81d35f081dc9614'},
  {file:path.join(__dirname,'..','assets','tokenizers','deepseek-v4','tokenizer_config.json'),bytes:3128,sha256:'841f8cf146e3f0ad1082594a31f68ecf7608c20467ef355081333d85bbaeb1cb'},
])
const CODES=new Set(['BUDGET_INVALID','TEXT_BYTE_LIMIT','IMAGE_INVALID','IMAGE_LIMIT','IMAGE_PROFILE_UNSUPPORTED','TOKENIZER_UNAVAILABLE','CONTEXT_LIMIT'])
const fail=code=>{throw Object.assign(new Error('Local model input budget rejected.'),{code})}
function record(value,keys,required=keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('BUDGET_INVALID')
  const d=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(d)
  if(actual.some(k=>typeof k!=='string'||!keys.includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value'))
    ||required.some(k=>!Object.hasOwn(d,k)))fail('BUDGET_INVALID')
  return value
}
function array(value,max){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!value.length||value.length>max)fail('BUDGET_INVALID')
  const d=Object.getOwnPropertyDescriptors(value)
  if(Reflect.ownKeys(d).length!==value.length+1)fail('BUDGET_INVALID')
  for(let i=0;i<value.length;i++)if(!d[i]?.enumerable||!Object.hasOwn(d[i],'value'))fail('BUDGET_INVALID')
  return value
}
function text(value){
  if(typeof value!=='string'||value.length>TEXT_MAX_BYTES||Buffer.from(value,'utf8').toString('utf8')!==value)fail('BUDGET_INVALID')
  return value
}
function image(value){
  record(value,['url','detail'],['url'])
  if(Object.hasOwn(value,'detail')&&!['low','high','auto'].includes(value.detail))fail('IMAGE_INVALID')
  if(typeof value.url!=='string'||value.url.length>Math.ceil(IMAGE_MAX_BYTES/3)*4+32)fail('IMAGE_LIMIT')
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.url)
  if(!match||match[2].length%4!==0)fail('IMAGE_INVALID')
  const bytes=Buffer.from(match[2],'base64')
  if(bytes.length>IMAGE_MAX_BYTES)fail('IMAGE_LIMIT')
  if(bytes.toString('base64')!==match[2]
    ||(match[1]==='png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    ||(match[1]==='jpeg'&&(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)))fail('IMAGE_INVALID')
  return bytes.length
}
function serializeMessages(messages){
  let imageCount=0,imageBytes=0
  const clean=array(messages,32).map(message=>{
    record(message,['role','content'])
    if(!['system','user','assistant'].includes(message.role))fail('BUDGET_INVALID')
    let content
    if(typeof message.content==='string')content=text(message.content)
    else content=array(message.content,16).map(part=>{
      record(part,['type','text','image_url'],['type'])
      if(part.type==='text'){record(part,['type','text']);return {type:'text',text:text(part.text)}}
      if(part.type!=='image_url'||message.role!=='user')fail('BUDGET_INVALID')
      record(part,['type','image_url']);imageCount++;if(imageCount>1)fail('IMAGE_LIMIT')
      imageBytes+=image(part.image_url)
      // Base64 is not language text; preserve an explicit marker and account for
      // image separately. Never pretend a byte cap is a vision-token calculator.
      return {type:'image_url',image_url:{url:'[image-accounted-separately]',...(part.image_url.detail?{detail:part.image_url.detail}:{})}}
    })
    return {role:message.role,content}
  })
  const serialized=JSON.stringify({messages:clean}),serializedTextBytes=Buffer.byteLength(serialized,'utf8')
  if(serializedTextBytes>TEXT_MAX_BYTES)fail('TEXT_BYTE_LIMIT')
  return {serialized,serializedTextBytes,imageCount,imageBytes}
}
let tokenizer=null
function loadTokenizer(){
  if(tokenizer)return tokenizer
  try{
    const bytes=ASSETS.map(asset=>{
      const stat=fs.lstatSync(asset.file)
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1||stat.size!==asset.bytes||fs.realpathSync(asset.file)!==asset.file)throw Error('asset')
      const data=fs.readFileSync(asset.file)
      if(crypto.createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error('integrity')
      return data
    })
    const {Tokenizer}=require('./vendor/tokenizers/tokenizers.cjs')
    tokenizer=new Tokenizer(JSON.parse(bytes[1].toString('utf8')),JSON.parse(bytes[2].toString('utf8')))
    return tokenizer
  }catch{fail('TOKENIZER_UNAVAILABLE')}
}
function inspectBudget(input){
  try{
    record(input,['messages','profile','contextTokens','maxOutputTokens'],['messages'])
    const profile=Object.hasOwn(input,'profile')?input.profile:'conservative'
    const contextTokens=Object.hasOwn(input,'contextTokens')?input.contextTokens:DEFAULT_CONTEXT_TOKENS
    const maxOutputTokens=Object.hasOwn(input,'maxOutputTokens')?input.maxOutputTokens:DEFAULT_OUTPUT_TOKENS
    if(!['conservative','deepseek-v4'].includes(profile)||!Number.isInteger(contextTokens)||contextTokens<CONTEXT_MIN||contextTokens>CONTEXT_MAX
      ||!Number.isInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>32768)fail('BUDGET_INVALID')
    const {serialized,serializedTextBytes,imageCount,imageBytes}=serializeMessages(input.messages)
    if(profile==='deepseek-v4'&&imageCount)fail('IMAGE_PROFILE_UNSUPPORTED')
    let inputUnits=serializedTextBytes
    if(profile==='deepseek-v4'){
      const encoded=loadTokenizer().encode(serialized,{add_special_tokens:false})
      if(!Array.isArray(encoded?.ids)||encoded.ids.some(id=>!Number.isSafeInteger(id)||id<0))fail('TOKENIZER_UNAVAILABLE')
      inputUnits=encoded.ids.length
    }
    const imageReserve=imageCount*IMAGE_RESERVE,totalReserved=inputUnits+maxOutputTokens+ENVELOPE_RESERVE+imageReserve
    return {ok:totalReserved<=contextTokens,code:totalReserved<=contextTokens?null:'CONTEXT_LIMIT',profile,
      measurement:profile==='conservative'?'utf8-byte-proxy':'offline-tokenizer-serialized-json',exactBilling:false,
      inputUnits,inputTokens:profile==='deepseek-v4'?inputUnits:null,serializedTextBytes,
      imageCount,imageBytes,imageReserve,reservedOutputTokens:maxOutputTokens,envelopeReserve:ENVELOPE_RESERVE,
      totalReserved,contextTokens,remaining:Math.max(0,contextTokens-totalReserved)}
  }catch(error){return {ok:false,code:CODES.has(error?.code)?error.code:'TOKENIZER_UNAVAILABLE',exactBilling:false}}
}
module.exports=Object.freeze({inspectBudget,CONTEXT_MIN,CONTEXT_MAX,DEFAULT_CONTEXT_TOKENS,DEFAULT_OUTPUT_TOKENS,
  ENVELOPE_RESERVE,TEXT_MAX_BYTES,IMAGE_MAX_BYTES,IMAGE_RESERVE})
