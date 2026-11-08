"""Cached service responses never keep credentials the service echoes back."""
from pipelines.resources.cache import redact


def test_redact_removes_echoed_header_values():
    body = b'{"result": {"job_id": "abc", "user_key": "0123456789abcdef"}}'
    out = redact(body, {"user_key": "0123456789abcdef"})
    assert b"0123456789abcdef" not in out
    assert b'"job_id": "abc"' in out


def test_redact_ignores_short_or_missing_headers():
    body = b'{"x": "ab"}'
    assert redact(body, None) == body
    assert redact(body, {"h": "ab"}) == body
