#!/bin/sh
# Regenerate apps/web/src/api/schema.d.ts from contracts/openapi.yaml.
# Runs openapi-typescript isolated in a temp dir so it uses its own
# TypeScript 5 dependency instead of the workspace's TypeScript 7 (incompatible).
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$ROOT/contracts/openapi.yaml" "$TMP/in.yaml"
cd "$TMP"
bunx --bun openapi-typescript@7 in.yaml -o schema.d.ts
cp "$TMP/schema.d.ts" "$ROOT/apps/web/src/api/schema.d.ts"
echo "apps/web/src/api/schema.d.ts regenerated"
