"""In-memory attack-session store: uuid4-hex keys, lock, 2 h TTL, max 500."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field

TTL_SECONDS = 2 * 3600
MAX_SESSIONS = 500


@dataclass
class SessionRecord:
    session_id: str
    engine: object
    candidate_id: str
    created_at: float = field(default_factory=time.time)
    last_access: float = field(default_factory=time.time)
    revealed_cohorts: set[str] = field(default_factory=set)
    preregistered: bool = True  # False for hidden tests built on the fly


class SessionStore:
    def __init__(self, ttl: float = TTL_SECONDS, max_sessions: int = MAX_SESSIONS) -> None:
        self._ttl = ttl
        self._max = max_sessions
        self._lock = threading.Lock()
        self._sessions: dict[str, SessionRecord] = {}

    def create(self, engine, candidate_id: str, preregistered: bool = True) -> SessionRecord:
        with self._lock:
            now = time.time()
            self._evict_locked(now)
            sid = uuid.uuid4().hex
            rec = SessionRecord(
                session_id=sid, engine=engine, candidate_id=candidate_id, created_at=now,
                last_access=now, preregistered=preregistered,
            )
            self._sessions[sid] = rec
            return rec

    def get(self, session_id: str) -> SessionRecord | None:
        with self._lock:
            rec = self._sessions.get(session_id)
            if rec is None:
                return None
            if time.time() - rec.last_access > self._ttl:
                del self._sessions[session_id]
                return None
            rec.last_access = time.time()
            return rec

    def note_revealed_cohort(self, session_id: str, cohort: str | None) -> None:
        if not cohort:
            return
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id].revealed_cohorts.add(cohort)

    def _evict_locked(self, now: float) -> None:
        expired = [
            sid for sid, r in self._sessions.items() if now - r.last_access > self._ttl
        ]
        for sid in expired:
            del self._sessions[sid]
        while len(self._sessions) >= self._max:
            oldest = min(self._sessions, key=lambda s: self._sessions[s].created_at)
            del self._sessions[oldest]
