import io
import unittest
import wave
import numpy as np
from server import decode_audio

class DecodeTests(unittest.TestCase):
    def wav(self, seconds=0.2, rate=48000):
        out = io.BytesIO()
        with wave.open(out, 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate)
            f.writeframes(np.zeros(int(seconds * rate), dtype=np.int16).tobytes())
        return out.getvalue()

    def test_resamples_to_mono_16k(self):
        samples = decode_audio(self.wav())
        self.assertEqual(samples.dtype, np.float32)
        self.assertTrue(abs(len(samples) - 3200) < 100)

    def test_invalid_rejected(self):
        for data in [b'', b'not audio', self.wav(0.01)]:
            with self.assertRaises(Exception): decode_audio(data)

    def test_oversize_rejected(self):
        with self.assertRaises(ValueError): decode_audio(b'x' * (12 * 1024 * 1024 + 1))

class BodyLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_chunked_actual_bytes_are_limited_before_parser(self):
        from server import BodyLimitMiddleware, MAX_BYTES
        from fastapi import HTTPException
        async def application(scope, receive, send):
            await receive()
            await receive()
        items = iter([{'type':'http.request','body':b'x' * MAX_BYTES,'more_body':True},
                      {'type':'http.request','body':b'x' * 65537,'more_body':False}])
        async def receive(): return next(items)
        async def send(message): pass
        with self.assertRaises(HTTPException) as caught:
            await BodyLimitMiddleware(application)({'type':'http'}, receive, send)
        self.assertEqual(caught.exception.status_code, 413)

if __name__ == '__main__': unittest.main()
