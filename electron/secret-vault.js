'use strict';

// Main-process / ordinary Node only. Never import this module into a renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const VERSION = 1;
const ALGORITHM = 'dpapi-current-user';
const ERROR_MESSAGE = 'Secret storage operation failed';
const MAX_TEXT_BYTES = 16384;
const MAX_CIPHERTEXT_BYTES = 32768;
const MAX_FILE_BYTES = 1048576;
const MAX_ENTRIES = 64;
const PURPOSE_PREFIX = 'dafeiyu-vault-v1:';
const BATCH_MAX_ITEMS = 64;
const BATCH_MAX_PLAIN_BYTES = 1048576;
// JSON escaping can expand control characters sixfold. Ciphertext has DPAPI
// overhead and retains the existing per-record 32 KiB bound.
const BATCH_MAX_WIRE_BYTES = 8 * 1048576;

// This command is constant. All operation data travels through stdin, never argv.
// stdout is an internal pipe, not a log. Suppress native/provider error details.
const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$plainBytes = $null
$cipherBytes = $null
$entropy = $null
$sha = $null
try {
  [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false, $true)
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false, $true)
  Add-Type -AssemblyName System.Security | Out-Null
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $entropy = $sha.ComputeHash($utf8.GetBytes('dafeiyu-dpapi-v1:' + $request.purpose))
  $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($request.action -ceq 'protect') {
    $plainBytes = $utf8.GetBytes([string]$request.text)
    $cipherBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, $scope)
    $response = @{ ciphertext = [Convert]::ToBase64String($cipherBytes) }
  } elseif ($request.action -ceq 'unprotect') {
    $cipherBytes = [Convert]::FromBase64String([string]$request.ciphertext)
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($cipherBytes, $entropy, $scope)
    $response = @{ text = $utf8.GetString($plainBytes) }
  } else {
    throw 'Invalid operation'
  }
  [Console]::Out.Write(($response | ConvertTo-Json -Compress))
} catch {
  [Console]::Error.Write('SECRET_VAULT_ERROR')
  exit 1
} finally {
  if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
  if ($null -ne $cipherBytes) { [Array]::Clear($cipherBytes, 0, $cipherBytes.Length) }
  if ($null -ne $entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
  if ($null -ne $sha) { $sha.Dispose() }
}
`;

// Separate constant command: existing single-secret behavior is unchanged.
// No response is emitted until every item has succeeded. Each item's entropy
// is identical to the single-item implementation; batching is not encryption.
const POWERSHELL_BATCH_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sha = $null
$plainBytes = $null
$cipherBytes = $null
$entropy = $null
try {
  [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false, $true)
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false, $true)
  $wire = [Console]::In.ReadToEnd()
  $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
  if ($utf8.GetByteCount($wire) -gt 8388608) { throw 'Invalid request' }
  $request = $wire | ConvertFrom-Json
  if ($request.action -cne 'protect' -and $request.action -cne 'unprotect') { throw 'Invalid operation' }
  if ($request.items -isnot [Array] -or $request.items.Count -lt 1 -or $request.items.Count -gt 64) { throw 'Invalid count' }
  Add-Type -AssemblyName System.Security | Out-Null
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  $responses = New-Object System.Collections.ArrayList
  $plainTotal = 0
  $cipherTotal = 0
  for ($index = 0; $index -lt $request.items.Count; $index++) {
    $item = $request.items[$index]
    try {
      if ($item.index -ne $index -or $item.purpose -isnot [string] -or $item.purpose.Length -eq 0 -or $utf8.GetByteCount($item.purpose) -gt 512) { throw 'Invalid item' }
      $entropy = $sha.ComputeHash($utf8.GetBytes('dafeiyu-dpapi-v1:' + $item.purpose))
      if ($request.action -ceq 'protect') {
        if ($item.text -isnot [string]) { throw 'Invalid text' }
        $plainBytes = $utf8.GetBytes($item.text)
        if ($plainBytes.Length -lt 1 -or $plainBytes.Length -gt 16384) { throw 'Invalid text length' }
        $plainTotal += $plainBytes.Length
        if ($plainTotal -gt 1048576) { throw 'Invalid total' }
        $cipherBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, $scope)
        if ($cipherBytes.Length -lt 1 -or $cipherBytes.Length -gt 32768) { throw 'Invalid cipher length' }
        $response = @{ index = $index; purpose = $item.purpose; ciphertext = [Convert]::ToBase64String($cipherBytes) }
      } else {
        if ($item.ciphertext -isnot [string] -or $item.ciphertext.Length -gt 43692) { throw 'Invalid cipher' }
        $cipherBytes = [Convert]::FromBase64String($item.ciphertext)
        if ($cipherBytes.Length -lt 1 -or $cipherBytes.Length -gt 32768 -or [Convert]::ToBase64String($cipherBytes) -cne $item.ciphertext) { throw 'Invalid cipher length' }
        $cipherTotal += $cipherBytes.Length
        if ($cipherTotal -gt 2097152) { throw 'Invalid cipher total' }
        $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($cipherBytes, $entropy, $scope)
        if ($plainBytes.Length -lt 1 -or $plainBytes.Length -gt 16384) { throw 'Invalid text length' }
        $plainTotal += $plainBytes.Length
        if ($plainTotal -gt 1048576) { throw 'Invalid total' }
        $response = @{ index = $index; purpose = $item.purpose; text = $utf8.GetString($plainBytes) }
      }
      $responses.Add($response) | Out-Null
    } finally {
      if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length); $plainBytes = $null }
      if ($null -ne $cipherBytes) { [Array]::Clear($cipherBytes, 0, $cipherBytes.Length); $cipherBytes = $null }
      if ($null -ne $entropy) { [Array]::Clear($entropy, 0, $entropy.Length); $entropy = $null }
    }
  }
  $output = @{ results = @($responses.ToArray()) } | ConvertTo-Json -Depth 6 -Compress
  if ($utf8.GetByteCount($output) -gt 8388608) { throw 'Invalid output' }
  [Console]::Out.Write($output)
} catch {
  [Console]::Error.Write('SECRET_VAULT_ERROR')
  exit 1
} finally {
  if ($null -ne $sha) { $sha.Dispose() }
}
`;

function failure() {
  const error = new Error(ERROR_MESSAGE);
  error.code = 'SECRET_VAULT_ERROR';
  return error;
}

function guarded(fn) {
  return (...args) => {
    try { return fn(...args); } catch { throw failure(); }
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys) {
  if (!isObject(value)) throw failure();
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw failure();
}

function checkText(value, maxBytes = MAX_TEXT_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxBytes
    || Buffer.byteLength(value, 'utf8') > maxBytes
    || Buffer.from(value, 'utf8').toString('utf8') !== value) throw failure();
  return value;
}

function checkName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(name)
    || ['__proto__', 'prototype', 'constructor'].includes(name)) throw failure();
  return name;
}

function checkRecord(record) {
  exactKeys(record, ['version', 'algorithm', 'ciphertext']);
  if (record.version !== VERSION || record.algorithm !== ALGORITHM
    || typeof record.ciphertext !== 'string' || record.ciphertext.length === 0
    || record.ciphertext.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.ciphertext)) throw failure();
  const decoded = Buffer.from(record.ciphertext, 'base64');
  if (decoded.length === 0 || decoded.length > MAX_CIPHERTEXT_BYTES
    || decoded.toString('base64') !== record.ciphertext) throw failure();
  return { version: VERSION, algorithm: ALGORITHM, ciphertext: record.ciphertext };
}

function runDpapi(action, payload, purpose) {
  if (process.platform !== 'win32') throw failure();
  checkText(purpose, 512);
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  if (!path.isAbsolute(systemRoot)) throw failure();
  const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_SCRIPT], {
    input: JSON.stringify({ action, purpose, ...payload }),
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 15000,
    maxBuffer: MAX_FILE_BYTES,
    // Do not forward provider credentials that happen to exist in the host env.
    env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: path.join(systemRoot, 'System32') }
  });
  if (result.error || result.status !== 0 || result.signal || result.stderr) throw failure();
  return JSON.parse(result.stdout);
}

const protectString = guarded((text, purpose) => {
  checkText(text);
  checkText(purpose, 512);
  const response = runDpapi('protect', { text }, purpose);
  exactKeys(response, ['ciphertext']);
  return checkRecord({ version: VERSION, algorithm: ALGORITHM, ciphertext: response.ciphertext });
});

const unprotectString = guarded((record, purpose) => {
  const safeRecord = checkRecord(record);
  checkText(purpose, 512);
  const response = runDpapi('unprotect', { ciphertext: safeRecord.ciphertext }, purpose);
  exactKeys(response, ['text']);
  return checkText(response.text);
});

function batchObject(value, keys) {
  exactKeys(value, keys);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw failure();
  return value;
}

function batchArray(value, count) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1 || value.length > BATCH_MAX_ITEMS || (count !== undefined && value.length !== count)) throw failure();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw failure();
  for (let index = 0; index < value.length; index++) {
    if (!descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], 'value')) throw failure();
  }
  return value;
}

function runDpapiBatch(action, items) {
  if (process.platform !== 'win32') throw failure();
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  if (!path.isAbsolute(systemRoot)) throw failure();
  const input = JSON.stringify({ action, items });
  if (Buffer.byteLength(input, 'utf8') > BATCH_MAX_WIRE_BYTES) throw failure();
  const result = spawnSync(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_BATCH_SCRIPT], {
      input, encoding: 'utf8', windowsHide: true, shell: false, timeout: 15000, maxBuffer: BATCH_MAX_WIRE_BYTES,
      env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: path.join(systemRoot, 'System32') }
    });
  if (!result || result.error || result.status !== 0 || result.signal || result.stderr
    || typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout, 'utf8') > BATCH_MAX_WIRE_BYTES) throw failure();
  const response = batchObject(JSON.parse(result.stdout), ['results']);
  return batchArray(response.results, items.length);
}

// Private strings/records are copied and validated before invoking a process.
// Return only a complete, checked array; never expose partial provider output.
Object.defineProperty(protectString, 'batch', { value: guarded((input) => {
  let total = 0;
  const items = batchArray(input).map((item, index) => {
    batchObject(item, ['text', 'purpose']);
    const text = checkText(item.text), purpose = checkText(item.purpose, 512);
    total += Buffer.byteLength(text, 'utf8');
    if (total > BATCH_MAX_PLAIN_BYTES) throw failure();
    return { index, purpose, text };
  });
  return runDpapiBatch('protect', items).map((response, index) => {
    batchObject(response, ['index', 'purpose', 'ciphertext']);
    if (response.index !== index || response.purpose !== items[index].purpose) throw failure();
    return checkRecord({ version: VERSION, algorithm: ALGORITHM, ciphertext: response.ciphertext });
  });
}) });

Object.defineProperty(unprotectString, 'batch', { value: guarded((input) => {
  let total = 0;
  const items = batchArray(input).map((item, index) => {
    batchObject(item, ['record', 'purpose']);
    batchObject(item.record, ['version', 'algorithm', 'ciphertext']);
    const record = checkRecord(item.record), purpose = checkText(item.purpose, 512);
    total += Buffer.from(record.ciphertext, 'base64').length;
    if (total > BATCH_MAX_ITEMS * MAX_CIPHERTEXT_BYTES) throw failure();
    return { index, purpose, ciphertext: record.ciphertext };
  });
  total = 0;
  return runDpapiBatch('unprotect', items).map((response, index) => {
    batchObject(response, ['index', 'purpose', 'text']);
    if (response.index !== index || response.purpose !== items[index].purpose) throw failure();
    const text = checkText(response.text);
    total += Buffer.byteLength(text, 'utf8');
    if (total > BATCH_MAX_PLAIN_BYTES) throw failure();
    return text;
  });
}) });

function emptyDocument() {
  return { version: VERSION, algorithm: ALGORITHM, entries: Object.create(null) };
}

function validateDocument(document) {
  exactKeys(document, ['version', 'algorithm', 'entries']);
  if (document.version !== VERSION || document.algorithm !== ALGORITHM || !isObject(document.entries)) throw failure();
  const names = Reflect.ownKeys(document.entries);
  if (names.length > MAX_ENTRIES) throw failure();
  const result = emptyDocument();
  for (const name of names) result.entries[checkName(name)] = checkRecord(document.entries[name]);
  return result;
}

function readDocument(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return emptyDocument();
    throw failure();
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) throw failure();
  return validateDocument(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function writeDocument(file, document) {
  const serialized = JSON.stringify(validateDocument(document), null, 2) + '\n';
  if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) throw failure();
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  // Same-directory exclusive tempfile: only fully written ciphertext is renamed.
  const temporary = path.join(directory, '.' + path.basename(file) + '.' + crypto.randomUUID() + '.tmp');
  let fd;
  let ownsTemporary = false;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    ownsTemporary = true;
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
    ownsTemporary = false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* public error is sanitized */ } }
    if (ownsTemporary) { try { fs.unlinkSync(temporary); } catch { /* ciphertext only; never delete the destination */ } }
  }
}

const createVault = guarded((file, options = {}) => {
  if (typeof file !== 'string' || file.length === 0 || file.length > 32767 || !path.isAbsolute(file)) throw failure();
  if (!isObject(options) || Reflect.ownKeys(options).some((key) => !['protect', 'unprotect'].includes(key))) throw failure();
  const injected = Object.hasOwn(options, 'protect') || Object.hasOwn(options, 'unprotect');
  if (injected && (typeof options.protect !== 'function' || typeof options.unprotect !== 'function')) throw failure();
  const protect = injected ? options.protect : protectString;
  const unprotect = injected ? options.unprotect : unprotectString;
  const target = path.resolve(file);
  let providerAvailable;
  const purposeFor = (name) => PURPOSE_PREFIX + name;

  return Object.freeze({
    get: guarded((name) => {
      checkName(name);
      const entries = readDocument(target).entries;
      if (!Object.hasOwn(entries, name)) return null;
      return checkText(unprotect(entries[name], purposeFor(name)));
    }),
    set: guarded((name, value) => {
      checkName(name);
      checkText(value);
      const document = readDocument(target);
      if (!Object.hasOwn(document.entries, name) && Object.keys(document.entries).length >= MAX_ENTRIES) throw failure();
      document.entries[name] = checkRecord(protect(value, purposeFor(name)));
      writeDocument(target, document);
      return true;
    }),
    remove: guarded((name) => {
      checkName(name);
      const document = readDocument(target);
      if (!Object.hasOwn(document.entries, name)) return false;
      delete document.entries[name];
      writeDocument(target, document);
      return true;
    }),
    has: guarded((name) => {
      checkName(name);
      return Object.hasOwn(readDocument(target).entries, name);
    }),
    status: guarded(() => {
      const names = Object.keys(readDocument(target).entries).sort();
      if (providerAvailable === undefined) {
        try {
          // Synthetic, memory-only probe. Does not decrypt any saved secret.
          const canary = crypto.randomBytes(24).toString('hex');
          const purpose = PURPOSE_PREFIX + 'availability-probe';
          providerAvailable = unprotect(checkRecord(protect(canary, purpose)), purpose) === canary;
        } catch { providerAvailable = false; }
      }
      return { version: VERSION, algorithm: ALGORITHM, available: providerAvailable, count: names.length, names };
    })
  });
});

module.exports = Object.freeze({ protectString, unprotectString, createVault });
