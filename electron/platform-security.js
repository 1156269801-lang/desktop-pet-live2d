'use strict'
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const MAX_LEGACY_BYTES = 4 * 1024 * 1024
const codes = {
  PLATFORM_UNSAFE_PATH: '本目录存在不安全的链接或文件类型，已停止操作。',
  PLATFORM_ACL_FAILED: '私有目录 Windows 权限未通过核验，已停止启动。',
  PLATFORM_UNSUPPORTED: '此候选版的私有目录权限保护仅支持 Windows。',
  PLATFORM_SANDBOX_DISABLED: '检测到禁用沙箱的启动选项，已停止启动。',
  LEGACY_INVALID: '旧字段管理请求或存储格式无效。',
  LEGACY_CONFLICT: '旧字段已发生变化，请重新查看并确认。',
  LEGACY_BUSY: '另一项旧字段清理正在进行，或上次留下锁；未强行清锁。',
  LEGACY_IO_FAILED: '旧字段清理未全部完成，请查看分文件结果后重试。',
}
const fail = code => Object.assign(Error(codes[code]), { code })
const own = (value, key) => Boolean(value && typeof value === 'object' && Object.hasOwn(value, key))
const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const ACL_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
# A parent PowerShell 7 process can leave its PSModulePath in the environment.
# Load the Windows PowerShell system module explicitly, never a user search path.
Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Security','Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop
$targets=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DAFEIYU_ACL_TARGETS)))
$apply=$env:DAFEIYU_ACL_APPLY -eq '1'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$results=@()
function Test-PrivateAcl($item,$acl,$isRoot){
  if(($isRoot -and -not $acl.AreAccessRulesProtected) -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){return $false}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  if($rules.Count -ne 2){return $false}
  $expectedInherit=if($item.PSIsContainer){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
  foreach($identity in @($sid.Value,'S-1-5-18')){
    $match=@($rules | Where-Object {$_.IdentityReference.Value -eq $identity -and $_.AccessControlType -eq 'Allow' -and (-not $isRoot -or -not $_.IsInherited) -and $_.InheritanceFlags -eq $expectedInherit -and $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None -and ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl})
    if($match.Count -ne 1){return $false}
  }
  return $true
}
foreach($target in $targets){
  $rootItem=Get-Item -LiteralPath $target -Force
  if(($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not $rootItem.PSIsContainer){throw 'UNSAFE'}
  $items=@($rootItem)+@(Get-ChildItem -LiteralPath $target -Force -Recurse)
  foreach($item in $items){
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'UNSAFE'}
    $isRoot=$item.FullName -eq $rootItem.FullName
    $currentAcl=Get-Acl -LiteralPath $item.FullName
    if($apply -and -not (Test-PrivateAcl $item $currentAcl $isRoot)){
      if($item.PSIsContainer){$acl=New-Object Security.AccessControl.DirectorySecurity;$inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}
      else{$acl=New-Object Security.AccessControl.FileSecurity;$inherit=[Security.AccessControl.InheritanceFlags]::None}
      # Only mark the DACL dirty, unless the owner actually needs to change.
      # Never send a SACL-bearing Get-Acl object through PowerShell Set-Acl.
      if($currentAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){$acl.SetOwner($sid)}
      $acl.SetAccessRuleProtection($true,$false)
      foreach($identity in @($sid,$system)){$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,[Security.AccessControl.FileSystemRights]::FullControl,$inherit,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($rule)}
      if($item.PSIsContainer){[IO.Directory]::SetAccessControl($item.FullName,$acl)}
      else{[IO.File]::SetAccessControl($item.FullName,$acl)}
    }
    $check=Get-Acl -LiteralPath $item.FullName
    if(-not (Test-PrivateAcl $item $check $isRoot)){throw 'ACL'}
  }
  $results+=@{name=$rootItem.Name;verified=$true;items=$items.Count}
}
@{ok=$true;targets=$results}|ConvertTo-Json -Depth 4 -Compress
`

function configureSandbox(app, argv = process.argv) {
  if ((argv || []).some(value => /^(?:--no-sandbox|--disable-setuid-sandbox|--disable-gpu-sandbox)(?:=|$)/.test(value))
    || ['no-sandbox', 'disable-setuid-sandbox', 'disable-gpu-sandbox'].some(flag => app.commandLine?.hasSwitch(flag))) throw fail('PLATFORM_SANDBOX_DISABLED')
  app.enableSandbox()
}

function createPlatformSecurity({ root, fs: io = fs, run = execFileSync, platform = process.platform,
  beforeLegacyDelete = () => {}, onLegacyCommitted = () => {} } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || /^\\\\/.test(root)) throw fail('PLATFORM_UNSAFE_PATH')
  const base = path.resolve(root), privateDir = path.join(base, '_private'), bridgeDir = path.join(base, '_integration')
  const paths = { state: path.join(base, 'state.json'), config: path.join(base, 'config.json') }
  let ready = false
  function safe(target, missing = false) {
    const resolved = path.resolve(target)
    if (resolved !== base && !resolved.startsWith(base + path.sep)) throw fail('PLATFORM_UNSAFE_PATH')
    const parsed = path.parse(resolved), parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)
    let current = parsed.root
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i]); let st
      try { st = io.lstatSync(current) } catch (e) { if (e.code === 'ENOENT' && missing) return null; throw fail('PLATFORM_UNSAFE_PATH') }
      if (st.isSymbolicLink() || (i < parts.length - 1 && !st.isDirectory()) || (st.isFile() && st.nlink > 1)) throw fail('PLATFORM_UNSAFE_PATH')
      if (i === parts.length - 1) return st
    }
    throw fail('PLATFORM_UNSAFE_PATH')
  }
  function tree(dir) {
    const st = safe(dir)
    if (!st.isDirectory()) throw fail('PLATFORM_UNSAFE_PATH')
    for (const name of io.readdirSync(dir)) {
      const child = path.join(dir, name), item = safe(child)
      if (item.isDirectory()) tree(child)
      else if (!item.isFile()) throw fail('PLATFORM_UNSAFE_PATH')
    }
  }
  function acl(apply) {
    if (platform !== 'win32') throw fail('PLATFORM_UNSUPPORTED')
    safe(base)
    for (const dir of [privateDir, bridgeDir]) {
      if (!safe(dir, true)) { if (!apply) throw fail('PLATFORM_ACL_FAILED'); io.mkdirSync(dir) }
      tree(dir)
    }
    try {
      const output = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ACL_SCRIPT, 'utf16le').toString('base64')], {
        windowsHide: true, timeout: 30000, encoding: 'utf8', maxBuffer: 256 * 1024,
        env: { ...process.env, DAFEIYU_ACL_TARGETS: Buffer.from(JSON.stringify([privateDir, bridgeDir]), 'utf8').toString('base64'), DAFEIYU_ACL_APPLY: apply ? '1' : '0' },
      })
      const result = JSON.parse(output.trim().replace(/^\uFEFF/, ''))
      if (result.ok !== true || !Array.isArray(result.targets) || result.targets.length !== 2
        || new Set(result.targets.map(item => item.name)).size !== 2
        || result.targets.some(item => item.verified !== true || !['_private', '_integration'].includes(item.name))) throw Error()
      for (const dir of [privateDir, bridgeDir]) tree(dir)
      return { ok: true, platform: 'win32', targets: result.targets.map(({ name, verified, items }) => ({ name, verified, items })) }
    } catch (error) { throw fail(error?.code === 'PLATFORM_UNSAFE_PATH' ? error.code : 'PLATFORM_ACL_FAILED') }
  }
  function initialize() {
    ready = false
    // Reopening a safe store is read-only: avoid unnecessary ACL/owner rewrites
    // and the extra Windows privileges those rewrites can require.
    try { const result = acl(false); ready = true; return result }
    catch (error) { if (error.code !== 'PLATFORM_ACL_FAILED') throw error }
    const result = acl(true); ready = true; return result
  }
  function inspect() { try { return acl(false) } catch (error) { return { ok: false, code: error.code, error: codes[error.code] || codes.PLATFORM_ACL_FAILED } } }
  function readDocument(name) {
    const file = paths[name], st = safe(file, true)
    if (!st) return { name, file, value: {}, digest: null, exists: false }
    if (!st.isFile() || st.size > MAX_LEGACY_BYTES) throw fail('LEGACY_INVALID')
    const fd = io.openSync(file, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0))
    let raw
    try {
      const opened = io.fstatSync(fd)
      if (!opened.isFile() || opened.nlink > 1 || opened.dev !== st.dev || opened.ino !== st.ino || opened.size > MAX_LEGACY_BYTES) throw fail('PLATFORM_UNSAFE_PATH')
      raw = io.readFileSync(fd, 'utf8')
    } finally { io.closeSync(fd) }
    let value
    try { value = JSON.parse(raw) } catch { throw fail('LEGACY_INVALID') }
    if (!plain(value)) throw fail('LEGACY_INVALID')
    return { name, file, value, digest: hash(raw), exists: true }
  }
  function legacySnapshot() {
    const documents = { state: readDocument('state'), config: readDocument('config') }
    const state = documents.state.value, config = documents.config.value
    const data = { state: {}, config: {} }
    for (const key of ['chat', 'memories']) if (own(state, key)) data.state[key] = state[key]
    for (const key of ['persona']) if (own(config, key)) data.config[key] = config[key]
    if (own(config.autonomy, 'persona')) data.config.autonomyPersona = config.autonomy.persona
    if (own(config.llm, 'apiKey')) data.config.llmApiKey = config.llm.apiKey
    if (own(config.llm, 'credentialRef')) data.config.llmCredentialRef = config.llm.credentialRef
    const count = key => ({ present: own(state, key), count: own(state, key) && Array.isArray(state[key]) ? state[key].length : null })
    const status = { ok: true, revision: hash(JSON.stringify(data)),
      hasLegacyData: Object.keys(data.state).length + Object.keys(data.config).length > 0,
      state: { chat: count('chat'), memories: count('memories') },
      config: { persona: own(config, 'persona'), autonomyPersona: own(config.autonomy, 'persona'),
        llmApiKey: own(config.llm, 'apiKey'), llmCredentialRef: own(config.llm, 'credentialRef') } }
    return { documents, status }
  }
  function publicError(error, completed = []) {
    const code = Object.hasOwn(codes, error?.code) ? error.code : 'LEGACY_IO_FAILED'
    return { ok: false, status: ['LEGACY_CONFLICT', 'LEGACY_BUSY'].includes(code) ? 409 : code === 'LEGACY_INVALID' ? 400 : 503,
      code, error: codes[code], completed, partial: completed.length > 0 }
  }
  function legacyStatus() { try { return legacySnapshot().status } catch (error) { return publicError(error) } }
  function replace(document, value) {
    if (readDocument(document.name).digest !== document.digest) throw fail('LEGACY_CONFLICT')
    const temporary = document.file + '.legacy-' + crypto.randomUUID() + '.tmp'; let fd, owned = false
    try {
      safe(temporary, true); fd = io.openSync(temporary, 'wx', 0o600); owned = true
      io.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n', 'utf8'); io.fsyncSync(fd); io.closeSync(fd); fd = undefined
      if (readDocument(document.name).digest !== document.digest) throw fail('LEGACY_CONFLICT')
      io.renameSync(temporary, document.file); owned = false
    } finally {
      if (fd !== undefined) { try { io.closeSync(fd) } catch {} }
      if (owned) { try { io.unlinkSync(temporary) } catch {} }
    }
  }
  function deleteLegacy(body) {
    if (!plain(body) || Reflect.ownKeys(body).length !== 2 || !Object.keys(body).every(key => ['expectedRevision', 'confirm'].includes(key))
      || Object.values(Object.getOwnPropertyDescriptors(body)).some(d => !Object.hasOwn(d, 'value'))
      || typeof body.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedRevision) || body.confirm !== 'DELETE_LEGACY_FIELDS') return publicError(fail('LEGACY_INVALID'))
    const completed = []; let lock, owned = false
    const lockPath = path.join(privateDir, 'legacy-cleanup.lock')
    try {
      if (!ready) throw fail('PLATFORM_ACL_FAILED')
      safe(lockPath, true)
      try { lock = io.openSync(lockPath, 'wx', 0o600); owned = true } catch (e) { throw fail(e.code === 'EEXIST' ? 'LEGACY_BUSY' : 'LEGACY_IO_FAILED') }
      const { documents, status } = legacySnapshot()
      if (status.revision !== body.expectedRevision) throw fail('LEGACY_CONFLICT')
      beforeLegacyDelete()
      if (status.state.chat.present || status.state.memories.present) {
        delete documents.state.value.chat; delete documents.state.value.memories
        replace(documents.state, documents.state.value); completed.push('state'); onLegacyCommitted('state')
      }
      if (Object.values(status.config).some(Boolean)) {
        delete documents.config.value.persona
        if (plain(documents.config.value.autonomy)) delete documents.config.value.autonomy.persona
        if (plain(documents.config.value.llm)) { delete documents.config.value.llm.apiKey; delete documents.config.value.llm.credentialRef }
        replace(documents.config, documents.config.value); completed.push('config'); onLegacyCommitted('config')
      }
      return { ...legacySnapshot().status, completed, partial: false }
    } catch (error) { return publicError(error, completed) }
    finally { if (lock !== undefined) { try { io.closeSync(lock) } catch {} }; if (owned) { try { io.unlinkSync(lockPath) } catch {} } }
  }
  return { initialize, inspect, legacyStatus, deleteLegacy }
}
module.exports = { createPlatformSecurity, configureSandbox }
