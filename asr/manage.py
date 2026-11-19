"""Start/stop only this project's local ASR process; identity-check port first."""
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '_asr'
PYTHON = STATE / 'venv/Scripts/python.exe'
PID = STATE / 'service.pid'
URL = 'http://127.0.0.1:8000/health'

def health():
    try:
        with urllib.request.urlopen(URL, timeout=2) as response:
            data = json.load(response)
            return data if data.get('service') == 'desktop-pet-asr' and data.get('ok') else None
    except Exception:
        return None

def start():
    if health():
        print('ASR ready: ' + URL)
        return
    # A different listener must never be stopped or replaced.
    import socket
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', 8000)) == 0:
            raise SystemExit('Port 8000 is occupied by another service. Check it before starting ASR.')
    if not PYTHON.exists():
        raise SystemExit('ASR Python environment is missing. See asr/README.md.')
    STATE.mkdir(exist_ok=True)
    with (STATE / 'server.log').open('ab') as log:
        child = subprocess.Popen([str(PYTHON), '-u', str(ROOT / 'asr/server.py')], cwd=ROOT,
            stdin=subprocess.DEVNULL, stdout=log, stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    PID.write_text(str(child.pid), encoding='ascii')
    for _ in range(90):
        if health():
            print('ASR ready: ' + URL)
            return
        if child.poll() is not None:
            raise SystemExit('ASR exited; inspect _asr/server.log.')
        time.sleep(0.5)
    raise SystemExit('ASR is still loading; inspect _asr/server.log and /health.')

def stop():
    data = health()
    if not data or not PID.exists():
        print('No owned ASR service to stop.')
        return
    pid = int(PID.read_text().strip())
    # Validate exact process command before terminating a possibly reused PID.
    check = subprocess.run(['powershell.exe', '-NoProfile', '-Command',
        f'(Get-CimInstance Win32_Process -Filter "ProcessId={pid}").CommandLine'], capture_output=True, text=True)
    if str(ROOT / 'asr/server.py').lower() not in check.stdout.lower():
        raise SystemExit('PID does not belong to this project; left it untouched.')
    subprocess.run(['taskkill.exe', '/PID', str(pid), '/T', '/F'], check=True)
    PID.unlink(missing_ok=True)
    print('ASR stopped.')

if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'start'
    if action == 'start': start()
    elif action == 'stop': stop()
    elif action == 'status': print(json.dumps(health() or {'ok': False}, ensure_ascii=False))
    else: raise SystemExit('Usage: manage.py start|stop|status')
