"""Loopback-only SenseVoice CPU transcription service. No audio is retained."""
from __future__ import annotations
import argparse
import io
import os
import threading
import time
from pathlib import Path
from contextlib import asynccontextmanager

import av
import numpy as np
import sherpa_onnx
from fastapi import FastAPI, File, Form, Request, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / '_asr/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
MAX_BYTES = 12 * 1024 * 1024
MAX_SECONDS = 65
GATE = threading.Lock()
recognizer = None

def decode_audio(data: bytes) -> np.ndarray:
    if not data or len(data) > MAX_BYTES:
        raise ValueError('audio_size')
    chunks, total = [], 0
    with av.open(io.BytesIO(data)) as container:
        if not container.streams.audio:
            raise ValueError('no_audio')
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                values = output.to_ndarray().reshape(-1).astype(np.float32)
                total += values.size
                if total > MAX_SECONDS * 16000:
                    raise ValueError('audio_too_long')
                chunks.append(values)
        for output in resampler.resample(None):
            values = output.to_ndarray().reshape(-1).astype(np.float32)
            total += values.size
            if total > MAX_SECONDS * 16000:
                raise ValueError('audio_too_long')
            chunks.append(values)
    if total < 1600:
        raise ValueError('audio_too_short')
    return np.concatenate(chunks)

def transcribe(data: bytes):
    if not GATE.acquire(blocking=False):
        raise HTTPException(429, detail='ASR is busy; try again shortly')
    try:
        started = time.perf_counter()
        try:
            samples = decode_audio(data)
        except Exception:
            raise HTTPException(400, detail='Audio must be decodable, 0.1 to 65 seconds, and under 12 MB')
        if float(np.max(np.abs(samples))) < 0.0001:
            text = ''
        else:
            stream = recognizer.create_stream()
            stream.accept_waveform(16000, samples)
            recognizer.decode_stream(stream)
            text = stream.result.text.strip()
        return {'text': text, 'duration': round(len(samples) / 16000, 3),
                'processing_seconds': round(time.perf_counter() - started, 3),
                'model': 'sensevoice-int8', 'device': 'cpu'}
    finally:
        GATE.release()

@asynccontextmanager
async def lifespan(app):
    global recognizer
    recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(MODEL / 'model.int8.onnx'), tokens=str(MODEL / 'tokens.txt'),
        num_threads=min(4, os.cpu_count() or 2), language='auto', use_itn=True, provider='cpu')
    yield
    recognizer = None

class BodyLimitMiddleware:
    """Count actual streamed bytes before multipart can spool unbounded files."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        total = 0
        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get('body', b''))
            if total > MAX_BYTES + 65536:
                raise HTTPException(413, detail='Audio upload exceeds limit')
            return message
        await self.app(scope, limited_receive, send)

app = FastAPI(title='Desktop Pet Local ASR', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(BodyLimitMiddleware)

@app.middleware('http')
async def local_only(request: Request, call_next):
    host = request.headers.get('host', '')
    if request.client.host not in ('127.0.0.1', '::1') or host not in ('127.0.0.1:8000', 'localhost:8000'):
        return JSONResponse({'error': 'loopback_only'}, status_code=403)
    if request.headers.get('origin') or request.headers.get('sec-fetch-site') == 'cross-site':
        return JSONResponse({'error': 'browser_requests_disabled'}, status_code=403)
    try:
        if int(request.headers.get('content-length', '0')) > MAX_BYTES + 65536:
            return JSONResponse({'error': 'audio_too_large'}, status_code=413)
    except ValueError:
        return JSONResponse({'error': 'invalid_length'}, status_code=400)
    return await call_next(request)

@app.get('/health')
async def health():
    return {'ok': recognizer is not None, 'service': 'desktop-pet-asr', 'model': 'sensevoice-int8',
            'device': 'cpu', 'version': 1, 'languages': ['zh', 'en', 'ja', 'ko', 'yue'], 'max_seconds': MAX_SECONDS}

@app.post('/v1/audio/transcriptions')
async def transcription(file: UploadFile = File(...), model: str = Form('sensevoice'), language: str = Form('auto')):
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, detail='Audio exceeds 12 MB')
    return await run_in_threadpool(transcribe, data)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, log_level='info', limit_concurrency=4, timeout_keep_alive=5)
