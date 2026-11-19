"""Real model test with official Chinese WAV and WebM/Opus over HTTP."""
import io
import json
import time
from pathlib import Path
import av
import requests
from server import decode_audio
ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / '_asr/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'

def encode_webm(path):
    samples = decode_audio(path.read_bytes())
    output = io.BytesIO()
    with av.open(output, mode='w', format='webm') as container:
        stream = container.add_stream('libopus', rate=48000)
        stream.layout = 'mono'
        resampler = av.AudioResampler(format='flt', layout='mono', rate=48000)
        frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format='flt', layout='mono')
        frame.sample_rate = 16000
        for converted in resampler.resample(frame) + resampler.resample(None):
            for packet in stream.encode(converted): container.mux(packet)
        for packet in stream.encode(None): container.mux(packet)
    return output.getvalue()

session = requests.Session()
session.trust_env = False
results = {'health': session.get('http://127.0.0.1:8000/health', timeout=5).json()}
for name, data, mime in [('zh.wav', (MODEL / 'test_wavs/zh.wav').read_bytes(), 'audio/wav'),
                         ('zh.webm', encode_webm(MODEL / 'test_wavs/zh.wav'), 'audio/webm')]:
    started = time.perf_counter()
    r = session.post('http://127.0.0.1:8000/v1/audio/transcriptions', files={'file': (name, data, mime)}, data={'model':'sensevoice'}, timeout=90)
    r.raise_for_status()
    value = r.json()
    assert value['text'] and any('\u4e00' <= ch <= '\u9fff' for ch in value['text']), value
    results[name] = {**value, 'wall_seconds': round(time.perf_counter() - started, 3)}
    if name.endswith('webm'): (ROOT / '_asr/smoke-zh.webm').write_bytes(data)
r = session.post('http://127.0.0.1:8000/v1/audio/transcriptions', files={'file':('bad.webm',b'invalid','audio/webm')}, timeout=10)
assert r.status_code == 400, r.text
results['invalid_audio_status'] = r.status_code
r = session.get('http://127.0.0.1:8000/health', headers={'Origin':'https://example.com'}, timeout=5)
assert r.status_code == 403
results['browser_origin_status'] = r.status_code
(ROOT / '_asr/smoke-result.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False, indent=2))
