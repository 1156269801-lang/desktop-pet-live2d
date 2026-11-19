'use strict'
const fs=require('node:fs'),path=require('node:path')
function presets(root){
 const dir=path.join(root,'_tts/dafeiyu-zh'),gpt='D:/GPT-SoVITS'
 return [
 {id:'dafeiyu-zh',name:'中文 · 大肥鱼少女音',engine:'gpt-sovits',url:'http://127.0.0.1:9881/tts',refAudio:path.join(dir,'ref/dafeiyu_ref.wav'),refText:read(path.join(dir,'ref/prompt.txt')),refLang:'zh',sayLanguage:'zh',inferConfig:path.join(dir,'config/desktop-api.json'),installed:fs.existsSync(path.join(dir,'weights/da_fei_yu-e12.ckpt'))},
 {id:'xiaojiuhu-ja',name:'日语 · 小酒狐',engine:'gpt-sovits',url:'http://127.0.0.1:9880/tts',refAudio:gpt+'/ref_audio/idle50.wav',refText:read(gpt+'/ref_audio/idle50.txt'),refLang:'ja',sayLanguage:'ja',inferConfig:gpt+'/GPT_SoVITS/configs/tts_infer.yaml',installed:fs.existsSync(gpt+'/ref_audio/idle50.wav')}
 ]
}
function read(p){try{return fs.readFileSync(p,'utf8').trim()}catch{return ''}}
module.exports={presets}
