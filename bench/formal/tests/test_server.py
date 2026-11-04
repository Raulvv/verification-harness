"""HTTP API tests for the reader-first verifier (no model calls)."""

from __future__ import annotations

import json
import threading
import unittest
import urllib.error
import urllib.request

from formal.server import make_server


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = make_server("127.0.0.1", 0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.base = f"http://{host}:{port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def _post(self, path: str, payload: dict) -> tuple[int, dict]:
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as response:
            return response.status, json.loads(response.read())

    def test_health(self) -> None:
        with urllib.request.urlopen(self.base + "/health") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read()), {"status": "ok"})

    def test_verify_correct(self) -> None:
        status, body = self._post(
            "/verify",
            {
                "question": "What is the median annual wage for Writers and Authors?",
                "answer": "The 2023 median annual wage for writers and authors is $73,690 per year.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["verdict"], "ENTAILED")
        self.assertEqual(body["route"]["action"], "show")
        self.assertTrue(body["citations"])

    def test_verify_contradiction(self) -> None:
        status, body = self._post(
            "/verify",
            {
                "question": "What is the median annual wage for Writers and Authors?",
                "answer": "The 2023 median annual wage for writers and authors is $99,999 per year.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["verdict"], "CONTRADICTION")
        self.assertEqual(body["route"]["action"], "reject")

    def test_batch(self) -> None:
        status, body = self._post(
            "/batch",
            {
                "items": [
                    {
                        "id": "ok",
                        "question": "What is the median annual wage for Writers and Authors?",
                        "answer": "$73,690",
                    },
                    {
                        "id": "bad",
                        "question": "What is the median annual wage for Writers and Authors?",
                        "answer": "$99,999",
                    },
                ]
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(body["results"]), 2)
        self.assertEqual(body["results"][0]["verdict"], "ENTAILED")
        self.assertEqual(body["results"][1]["verdict"], "CONTRADICTION")

    def test_unknown_path(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/nope")
        self.assertEqual(ctx.exception.code, 404)
        ctx.exception.close()


if __name__ == "__main__":
    unittest.main()
