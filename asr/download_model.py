"""Download official release with bounded parallel byte ranges; verify GitHub digest."""
import concurrent.futures
import hashlib
import json
import tarfile
import time
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parents[1] / '_asr'
NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2'
SIZE = 163002883
SHA = '7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e'
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/' + NAME
ROOT.mkdir(exist_ok=True)
PARTS = ROOT / 'download-parts'
PARTS.mkdir(exist_ok=True)
import subprocess
headers_path = ROOT / 'download-headers.txt'
subprocess.run(['curl.exe', '-sS', '-I', '--max-time', '30', URL, '-o', str(headers_path)], check=True)
resolved = next(line.split(':', 1)[1].strip() for line in headers_path.read_text().splitlines() if line.lower().startswith('location:'))
CHUNK = 2 * 1024 * 1024

def download(i):
    start, end = i * CHUNK, min(SIZE, (i + 1) * CHUNK) - 1
    target = PARTS / str(i)
    if target.exists() and target.stat().st_size == end - start + 1:
        return i
    for attempt in range(4):
        try:
            subprocess.run(['curl.exe', '-sS', '--fail', '--retry', '2', '--max-time', '180',
                '-H', f'Range: bytes={start}-{end}', '-o', str(target), resolved], check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if target.stat().st_size != end - start + 1: raise ValueError('Part size mismatch')
            return i
        except Exception:
            if attempt == 3: raise
            time.sleep(attempt + 1)

count = (SIZE + CHUNK - 1) // CHUNK
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
    for done, _ in enumerate(pool.map(download, range(count)), 1):
        print(f'parts {done}/{count}', flush=True)
archive = ROOT / 'sensevoice-int8-verified.tar.bz2'
with archive.open('wb') as out:
    for i in range(count): out.write((PARTS / str(i)).read_bytes())
actual = hashlib.sha256(archive.read_bytes()).hexdigest()
if actual != SHA: raise RuntimeError('Model SHA256 mismatch')
models = ROOT / 'models'
models.mkdir(exist_ok=True)
with tarfile.open(archive) as t: t.extractall(models, filter='data')
(ROOT / 'model-source.json').write_text(json.dumps({'url': URL, 'sha256': SHA, 'bytes': SIZE}, indent=2), encoding='utf-8')
print('Verified and extracted model: ' + actual, flush=True)
