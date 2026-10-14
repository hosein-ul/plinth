# Python 3.8+, standard library only. Receives Plinth webhooks, verifies them, and acts once per event.
import hashlib, hmac, json, os, time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ["PLINTH_WEBHOOK_SECRET"].encode()
seen = set()  # use a database table in production, so a restart cannot cause a double delivery


def verify(raw: bytes, header: str, now=None) -> bool:
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        t = int(parts["t"])
        got = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs((now or time.time()) - t) > 300:
        return False
    want = hmac.new(SECRET, f"{t}.".encode() + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(got, want)


def on_paid(order_reference: str) -> None:
    print("paid:", order_reference, flush=True)  # mark the order paid and fulfil it here


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhooks/plinth":
            return self.send_response(404) or self.end_headers()
        raw = self.rfile.read(int(self.headers.get("content-length", 0)))  # verify the raw bytes
        if not verify(raw, self.headers.get("plinth-signature", "")):
            return self.send_response(401) or self.end_headers()
        event = json.loads(raw)
        if event["id"] not in seen:
            seen.add(event["id"])
            if event["type"] == "payment.confirmed":
                on_paid(event["data"]["object"]["order_reference"])
        self.send_response(200)  # a non-2xx makes Plinth retry later
        self.end_headers()


if __name__ == "__main__":
    HTTPServer(("", int(os.environ.get("PORT", "8789"))), Handler).serve_forever()
