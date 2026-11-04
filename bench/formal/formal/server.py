"""Minimal HTTP API for the reader-first verifier.

No model calls. Endpoints:
  GET  /health
  POST /verify   {"question": "...", "answer": "..."}
  POST /batch    {"items": [{"id": "...", "question": "...", "answer": "..."}]}
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .batch import BatchItem, verify_batch
from .extract import verify_reader_answer
from .router import route_verification
from .rows import build_dataset
from .z3check import Premises

DATASET = build_dataset()
PREMISES = Premises(DATASET)


def _claims(verification) -> list[str]:
    return [str(c.claim) for c in verification.checks if c.claim is not None]


def _citations(extraction) -> list[dict[str, Any]]:
    if extraction.answer is None:
        return []
    out: list[dict[str, Any]] = []
    for part in extraction.answer.parts:
        for citation in part.citations:
            item = citation.to_dict()
            if item not in out:
                out.append(item)
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "FormalVerifier/0.1"

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._send(400, {"error": "invalid json"})
            return

        if self.path == "/verify":
            question = payload.get("question")
            answer = str(payload.get("answer", ""))
            if not question:
                self._send(400, {"error": "question required"})
                return
            extraction, verification = verify_reader_answer(
                str(question), answer, DATASET, PREMISES
            )
            route = route_verification(verification)
            self._send(
                200,
                {
                    "question": question,
                    "verdict": verification.verdict,
                    "route": route.to_dict(),
                    "claims": _claims(verification),
                    "citations": _citations(extraction),
                    "assumptions": [a.to_dict() for a in verification.assumptions],
                    "spec_id": verification.spec_id,
                },
            )
            return

        if self.path == "/batch":
            rows = payload.get("items", [])
            if not isinstance(rows, list):
                self._send(400, {"error": "items must be a list"})
                return
            items = [
                BatchItem(
                    id=str(row.get("id", i)),
                    question=str(row.get("question", "")),
                    answer=str(row.get("answer", "")),
                )
                for i, row in enumerate(rows)
            ]
            results = verify_batch(items, DATASET, PREMISES)
            self._send(200, {"results": [r.to_dict() for r in results]})
            return

        self._send(404, {"error": "not found"})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep the API quiet in tests; a production server would wire a logger.
        return


def make_server(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), Handler)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Formal verifier HTTP API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)
    server = make_server(args.host, args.port)
    host, port = server.server_address
    print(f"formal verifier listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
