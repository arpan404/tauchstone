"""Response sanitiser: drop None-valued keys the contract types as non-nullable.

contracts/openapi.yaml marks only a few fields nullable (e.g. query_set,
max_phase, value/threshold). Optional fields serialised as null by pydantic
would fail contract validation, so routes pass payloads through public()
first. Keys in KEEP_NONE are required-but-nullable and must stay present
(e.g. recommended_context_id when the budget is exhausted).
"""

from __future__ import annotations

KEEP_NONE = frozenset({"recommended_context_id"})


def public(payload, keep_none: frozenset = KEEP_NONE):
    if isinstance(payload, dict):
        return {
            k: public(v, keep_none)
            for k, v in payload.items()
            if v is not None or k in keep_none
        }
    if isinstance(payload, list):
        return [public(v, keep_none) for v in payload]
    return payload
