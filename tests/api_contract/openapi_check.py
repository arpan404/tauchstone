"""Shared helpers: validate live responses against contracts/openapi.yaml."""

from __future__ import annotations

from pathlib import Path

import jsonschema
import yaml

ROOT = Path(__file__).resolve().parents[2]
SPEC = yaml.safe_load(open(ROOT / "contracts" / "openapi.yaml"))


def resolve(node):
    """Recursively resolve local $refs and merge allOf (single-level is enough here)."""
    if isinstance(node, dict):
        if set(node.keys()) == {"$ref"}:
            parts = node["$ref"].split("/")[1:]
            target = SPEC
            for p in parts:
                target = target[p.replace("~1", "/").replace("~0", "~")]
            return resolve(target)
        if "allOf" in node:
            merged: dict = {"type": "object", "properties": {}, "required": []}
            for part in node["allOf"]:
                r = resolve(part)
                merged["properties"].update(r.get("properties", {}))
                merged["required"].extend(r.get("required", []))
                for k in ("description",):
                    if k in r:
                        merged[k] = r[k]
            rest = {k: resolve(v) for k, v in node.items() if k != "allOf"}
            merged.update(rest)
            return merged
        return {k: resolve(v) for k, v in node.items()}
    if isinstance(node, list):
        return [resolve(v) for v in node]
    return node


def check(payload, schema_name: str) -> None:
    schema = resolve({"$ref": f"#/components/schemas/{schema_name}"})
    jsonschema.Draft202012Validator(schema).validate(payload)
