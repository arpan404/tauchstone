#!/bin/sh
# Fail if the committed schema.d.ts differs from a fresh generation.
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$ROOT/contracts/openapi.yaml" "$TMP/in.yaml"
cd "$TMP"
bunx --bun openapi-typescript@7 in.yaml -o fresh.d.ts >/dev/null
if diff -u "$ROOT/apps/web/src/api/schema.d.ts" "$TMP/fresh.d.ts"; then
  echo "schema.d.ts is in sync with contracts/openapi.yaml"
else
  echo "MISMATCH: run 'bun run gen:api' in apps/web and commit the result" >&2
  exit 1
fi
