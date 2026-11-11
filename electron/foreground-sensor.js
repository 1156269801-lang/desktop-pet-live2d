'use strict';

// A caller-controlled, read-only sensor. Construction does not inspect windows.
// Only call read() after the user has consented to the applicable observation.
// The generated script is static ASCII plus an explicit UTF-8 BOM for PS 5.1;
// paths and options are child environment values, never interpolated PS source.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { TextDecoder } = require('node:util');

const READ_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 16384;
const MAX_TITLE_LENGTH = 2048;
const MAX_PROCESS_LENGTH = 256;

const SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
try {
  $taskTemp = $env:PET_SENSOR_TMP
  if ([string]::IsNullOrWhiteSpace($taskTemp)) { throw 'Missing task temp' }
  $env:TEMP = $taskTemp
  $env:TMP = $taskTemp
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PetForegroundNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MONITORINFO {
    public uint cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int capacity);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetProcessDPIAware();
}
'@
  # Both rectangles must use the same physical-coordinate context on mixed DPI.
  [PetForegroundNative]::SetProcessDPIAware() | Out-Null
  $window = [PetForegroundNative]::GetForegroundWindow()
  if ($window -eq [IntPtr]::Zero) { [Console]::Out.Write('null'); exit 0 }
  [uint32]$foregroundProcessId = 0
  [PetForegroundNative]::GetWindowThreadProcessId($window, [ref]$foregroundProcessId) | Out-Null
  if ($foregroundProcessId -eq 0 -or $foregroundProcessId -eq [uint32]$env:PET_SENSOR_PARENT_PID) {
    [Console]::Out.Write('null'); exit 0
  }
  $windowRect = New-Object PetForegroundNative+RECT
  $monitor = [PetForegroundNative]::MonitorFromWindow($window, 2)
  $monitorInfo = New-Object PetForegroundNative+MONITORINFO
  $monitorInfo.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($monitorInfo)
  if ($monitor -eq [IntPtr]::Zero -or
      -not [PetForegroundNative]::GetWindowRect($window, [ref]$windowRect) -or
      -not [PetForegroundNative]::GetMonitorInfo($monitor, [ref]$monitorInfo)) {
    [Console]::Out.Write('null'); exit 0
  }
  $bounds = $monitorInfo.rcMonitor
  if ($windowRect.Right -le $windowRect.Left -or $windowRect.Bottom -le $windowRect.Top -or
      $bounds.Right -le $bounds.Left -or $bounds.Bottom -le $bounds.Top) {
    [Console]::Out.Write('null'); exit 0
  }
  # Compare full monitor bounds, not its taskbar-excluding work area.
  # A two-pixel allowance handles border rounding, not general maximization.
  $isFullscreen = ([Math]::Abs([long]$windowRect.Left - [long]$bounds.Left) -le 2) -and
    ([Math]::Abs([long]$windowRect.Top - [long]$bounds.Top) -le 2) -and
    ([Math]::Abs([long]$windowRect.Right - [long]$bounds.Right) -le 2) -and
    ([Math]::Abs([long]$windowRect.Bottom - [long]$bounds.Bottom) -le 2)
  $result = [ordered]@{ pid = $foregroundProcessId; fullscreen = [bool]$isFullscreen }
  if ($env:PET_SENSOR_INCLUDE_TITLE -ceq '1') {
    $builder = New-Object System.Text.StringBuilder 2049
    [PetForegroundNative]::GetWindowText($window, $builder, $builder.Capacity) | Out-Null
    $foregroundProcess = Get-Process -Id $foregroundProcessId -ErrorAction SilentlyContinue
    $result['title'] = $builder.ToString()
    $result['process'] = $(if ($foregroundProcess) { $foregroundProcess.ProcessName } else { '' })
  }
  # Reject a torn sample if focus changed while the process/title was read.
  if ([PetForegroundNative]::GetForegroundWindow() -ne $window) {
    [Console]::Out.Write('null'); exit 0
  }
  [Console]::Out.Write(($result | ConvertTo-Json -Compress))
} catch {
  # Never print exception details, paths, foreground titles or process names.
  [Console]::Out.Write('null')
}
`;

function parseResult(stdout, includeTitle) {
  try {
    const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout), 'utf8');
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) return null;
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || typeof parsed.fullscreen !== 'boolean'
      || !Number.isInteger(parsed.pid) || parsed.pid <= 0 || parsed.pid > 0xffffffff
      || parsed.pid === process.pid) return null;
    // Independently enforce the privacy boundary even if a child emits extra data.
    if (!includeTitle) return { fullscreen: parsed.fullscreen };
    if (typeof parsed.title !== 'string' || parsed.title.length > MAX_TITLE_LENGTH
      || typeof parsed.process !== 'string' || parsed.process.length > MAX_PROCESS_LENGTH) return null;
    return { title: parsed.title, process: parsed.process, fullscreen: parsed.fullscreen };
  } catch { return null; }
}

function createForegroundSensor({ root, execFileImpl = execFile } = {}) {
  if (typeof root !== 'string' || !root.trim() || root.includes('\0') || typeof execFileImpl !== 'function') {
    throw new TypeError('Invalid foreground sensor options');
  }
  const taskRoot = path.resolve(root);
  const tempRoot = path.join(taskRoot, '_tmp');
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  return Object.freeze({
    async read({ includeTitle = true, signal } = {}) {
      // Strict boolean opt-in avoids treating a configuration string as consent.
      if (typeof includeTitle !== 'boolean' || signal?.aborted) return null;
      if (signal !== undefined && (typeof signal.addEventListener !== 'function'
        || typeof signal.removeEventListener !== 'function' || typeof signal.aborted !== 'boolean')) return null;
      let directory;
      let scriptPath;
      function cleanup() {
        if (!directory) return;
        // Only this invocation's exact mkdtemp child is eligible for removal.
        const target = path.resolve(directory);
        if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith('foreground-sensor-')) return;
        try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* retry on child callback/close */ }
      }
      try {
        fs.mkdirSync(tempRoot, { recursive: true });
        directory = fs.mkdtempSync(path.join(tempRoot, 'foreground-sensor-'));
        scriptPath = path.join(directory, 'read.ps1');
        fs.writeFileSync(scriptPath, '\uFEFF' + SCRIPT, { encoding: 'utf8', flag: 'wx' });
      } catch { cleanup(); return null; }
      if (signal?.aborted) { cleanup(); return null; }
      return new Promise(resolve => {
        let settled = false;
        let child;
        let timer;
        function finish(value, stopChild = false) {
          if (settled) { cleanup(); return; }
          settled = true;
          if (timer !== undefined) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          if (stopChild) { try { child?.kill('SIGKILL'); } catch { /* task-owned child only */ } }
          cleanup();
          resolve(value);
        }
        function onAbort() { finish(null, true); }
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { finish(null); return; }
        timer = setTimeout(() => finish(null, true), READ_TIMEOUT_MS);
        try {
          child = execFileImpl(executable,
            ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { windowsHide: true, timeout: READ_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES,
              killSignal: 'SIGKILL', encoding: 'buffer', ...(signal ? { signal } : {}),
              env: { SystemRoot: systemRoot, WINDIR: systemRoot,
                PATH: path.join(systemRoot, 'System32'), TEMP: directory, TMP: directory,
                PET_SENSOR_TMP: directory, PET_SENSOR_PARENT_PID: String(process.pid),
                PET_SENSOR_INCLUDE_TITLE: includeTitle ? '1' : '0' } },
            (error, stdout) => finish(error || signal?.aborted ? null : parseResult(stdout, includeTitle)));
          child?.once?.('close', cleanup);
          // An injected executor may abort synchronously before returning its handle.
          if (settled && signal?.aborted) { try { child?.kill('SIGKILL'); } catch { /* no output */ } }
        } catch { finish(null, true); }
      });
    },
  });
}

module.exports = { createForegroundSensor, READ_TIMEOUT_MS, MAX_OUTPUT_BYTES };
