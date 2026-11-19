$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root 'app'
$ConfigFile = Join-Path $AppDir 'config.json'
$DataDir = Join-Path $Root 'data'
$LogDir = Join-Path $DataDir 'logs'
$Electron = Join-Path $Root 'runtime\electron\electron.exe'
$AsrPython = Join-Path $Root 'runtime\asr\venv\Scripts\python.exe'
$AsrManager = Join-Path $AppDir 'asr\manage.py'
$AsrServer = Join-Path $AppDir 'asr\server.py'
$TtsDir = Join-Path $Root 'runtime\tts\gpt-sovits'
$TtsStart = Join-Path $TtsDir 'start-desktop-api.ps1'
$TtsPython = Join-Path $TtsDir 'runtime\python.exe'
$TtsApi = Join-Path $TtsDir 'api_v2.py'
$AsrPidFile = Join-Path $Root 'runtime\asr\service.pid'
$script:AsrStarter = $null
$script:Started = @{}

function Read-Config { Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json }

function Read-Ports($Config) {
    $portTable = @{ Pet = [int]$Config.control.port }
    foreach ($key in @('TTS','ASR')) {
        $url = [Uri]$Config.$key.url
        if (!$url.IsAbsoluteUri -or $url.Scheme -ne 'http' -or $url.Host -notin @('localhost','127.0.0.1')) {
            throw "$key 地址必须是本机 HTTP URL。"
        }
        $portTable[$key] = $url.Port
    }
    return $portTable
}

function Test-Tcp([int]$Port) {
    if ($Port -lt 1 -or $Port -gt 65535) { return $false }
    $client = New-Object Net.Sockets.TcpClient
    try {
        $operation = $client.ConnectAsync('127.0.0.1', $Port)
        return $operation.Wait(100) -and $client.Connected
    } catch [AggregateException] {
        if ($_.Exception.GetBaseException() -isnot [Net.Sockets.SocketException]) { throw }
        return $false
    } finally { $client.Dispose() }
}

function Get-OwnedProcesses {
    $result = @{}
    $asrId = if (Test-Path -LiteralPath $AsrPidFile) { (Get-Content -LiteralPath $AsrPidFile -Raw).Trim() }
    foreach ($item in (Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='python.exe'")) {
        if (!$item.CommandLine -or !$item.ExecutablePath) { continue }
        if ($item.ExecutablePath -eq $Electron -and $item.CommandLine -notmatch '(?:^|\s)--type=' -and $item.CommandLine.IndexOf($AppDir, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $result.Pet = $item }
        if ($item.ExecutablePath -eq $TtsPython -and $item.CommandLine.IndexOf($TtsApi, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $result.TTS = $item }
        if ($item.ProcessId -eq $asrId -and $item.ExecutablePath -eq $AsrPython -and $item.CommandLine.IndexOf($AsrServer, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $result.ASR = $item }
    }
    return $result
}

function Get-ComponentFiles($Config) {
    return @{
        Pet = (Test-Path -LiteralPath $Electron -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $AppDir 'package.json') -PathType Leaf)
        TTS = (Test-Path -LiteralPath $TtsPython -PathType Leaf) -and (Test-Path -LiteralPath $TtsApi -PathType Leaf) -and (Test-Path -LiteralPath $TtsStart -PathType Leaf) -and (Test-Path -LiteralPath $Config.tts.inferConfig -PathType Leaf) -and (Test-Path -LiteralPath $Config.tts.refAudio -PathType Leaf)
        ASR = (Test-Path -LiteralPath $AsrPython -PathType Leaf) -and (Test-Path -LiteralPath $AsrServer -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $Root 'runtime\asr\models') -PathType Container)
    }
}

function Start-Component([string]$Name) {
    $config = Read-Config
    $ports = Read-Ports $config
    $owned = Get-OwnedProcesses
    if ($owned.ContainsKey($Name)) { return "$Name 已启动。" }
    if ($Name -eq 'ASR' -and $script:AsrStarter -and !$script:AsrStarter.HasExited) { return 'ASR 正在启动。' }
    if (!(Get-ComponentFiles $config)[$Name]) { throw "$Name 运行文件缺失。" }
    if (Test-Tcp $ports[$Name]) { throw "$Name 端口 $($ports[$Name]) 已被外部进程占用；未停止它。" }
    switch ($Name) {
        'Pet' {
            $saved = $env:ELECTRON_RUN_AS_NODE
            try {
                Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
                $script:Started.Pet = Start-Process -FilePath $Electron -ArgumentList ('"{0}"' -f $AppDir) -WorkingDirectory $AppDir -PassThru -RedirectStandardOutput (Join-Path $LogDir 'electron.out.log') -RedirectStandardError (Join-Path $LogDir 'electron.err.log')
            } finally { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $saved, 'Process') }
        }
        'TTS' { $script:Started.TTS = & $TtsStart -Port $ports.TTS -InferConfig $config.tts.inferConfig -LogDir $LogDir }
        'ASR' {
            $script:AsrStarter = Start-Process -FilePath $AsrPython -ArgumentList ('-B "{0}" start' -f $AsrManager) -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $LogDir 'asr-control.out.log') -RedirectStandardError (Join-Path $LogDir 'asr-control.err.log')
            $script:Started.ASR = $script:AsrStarter
        }
    }
    return "$Name 启动请求已发出。"
}

function Stop-Component([string]$Name) {
    $owned = Get-OwnedProcesses
    if (!$owned.ContainsKey($Name)) { return "$Name 无本目录进程可停止。" }
    $ownedId = $owned[$Name].ProcessId
    switch ($Name) {
        'Pet' { [IO.File]::WriteAllText((Join-Path $DataDir "quit-$ownedId.request"), '') }
        'TTS' { Stop-Process -Id $ownedId -ErrorAction Stop }
        'ASR' {
            Start-Process -FilePath $AsrPython -ArgumentList ('-B "{0}" stop' -f $AsrManager) -WorkingDirectory $AppDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir 'asr-stop.out.log') -RedirectStandardError (Join-Path $LogDir 'asr-stop.err.log')
        }
    }
    $script:Started.Remove($Name)
    return "$Name 停止请求已发出。"
}
