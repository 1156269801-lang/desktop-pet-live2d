'use strict'
const { execFile } = require('node:child_process')
const script = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.Encoding]::UTF8
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 if($request.action -eq 'voices') {
  $list=@($s.GetInstalledVoices()|Where-Object Enabled|ForEach-Object {@{id=$_.VoiceInfo.Name;name=$_.VoiceInfo.Name;language=$_.VoiceInfo.Culture.Name}})
  ConvertTo-Json -InputObject $list -Compress
 } else {
  if($request.voice){$s.SelectVoice($request.voice)}
  $m=New-Object IO.MemoryStream
  $s.SetOutputToWaveStream($m)
  $s.Speak([string]$request.text)
  $s.SetOutputToNull()
  [Convert]::ToBase64String($m.ToArray())
  $m.Dispose()
 }
} finally {$s.Dispose()}
`
function run(body) {
  return new Promise((resolve,reject)=>{
    const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'},(err,out)=>err?reject(new Error('系统语音不可用，请检查 Windows 语音包')):resolve(out.trim()))
    child.stdin.on('error',()=>{})
    child.stdin.end(JSON.stringify(body))
  })
}
let cached
async function voices(){if(!cached)cached=run({action:'voices'}).then(JSON.parse).catch(e=>{cached=null;throw e});return cached}
async function synthesize(text,voice=''){return run({action:'speak',text:String(text).slice(0,500),voice})}
module.exports={voices,synthesize}
