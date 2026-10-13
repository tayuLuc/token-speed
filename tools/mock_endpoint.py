#!/usr/bin/env python3
"""
Mock OpenAI-compatible streaming endpoint for testing the Live tab.

Not part of the deployed site — it exists so tools/verify.mjs can exercise the
streaming client without spending a real API key. Serves:

    GET  /v1/models
    POST /v1/chat/completions   (stream: true → SSE deltas, then usage)

Chunk arrival is driven by --rate so the page has something real to measure.
"""

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORDS = ("скорость токена это единица измерения генерации модель выдаёт текст "
         "последовательно и человек читает его по мере появления").split()


class Handler(BaseHTTPRequestHandler):
    rate = 40.0
    ttft = 0.4
    max_tokens = 120

    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization,content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        body = json.dumps({"object": "list", "data": [{"id": "mock-fast-1"}, {"id": "mock-slow-1"}]}).encode()
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        self.rfile.read(length)
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.end_headers()

        time.sleep(self.ttft)
        gap = 1.0 / self.rate
        sent = 0
        try:
            for i in range(self.max_tokens):
                piece = WORDS[i % len(WORDS)]
                chunk = {
                    "id": "chatcmpl-mock",
                    "object": "chat.completion.chunk",
                    "choices": [{"index": 0, "delta": {"content": piece + " "}, "finish_reason": None}],
                }
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.flush()
                sent += 1
                time.sleep(gap)
            final = {
                "id": "chatcmpl-mock",
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 12, "completion_tokens": sent, "total_tokens": sent + 12},
            }
            self.wfile.write(f"data: {json.dumps(final)}\n\n".encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--rate", type=float, default=40.0, help="tokens per second")
    ap.add_argument("--ttft", type=float, default=0.4, help="seconds before first token")
    ap.add_argument("--max-tokens", type=int, default=120)
    a = ap.parse_args()
    Handler.rate = a.rate
    Handler.ttft = a.ttft
    Handler.max_tokens = a.max_tokens
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"mock endpoint on http://127.0.0.1:{a.port}/v1  rate={a.rate} ttft={a.ttft}")
    srv.serve_forever()


if __name__ == "__main__":
    main()