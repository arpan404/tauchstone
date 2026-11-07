#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
make demo
bash scripts/offline_check.sh
out="${TS_EXPO_DIR:-${TS_DATA_DIR:-$HOME/Data/tauchstone}/expo}"
mkdir -p "$out"
tmp="$(mktemp "$out/expo-images.tar.gz.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
docker save tauchstone-api:latest tauchstone-web:latest | gzip > "$tmp"
mv "$tmp" "$out/expo-images.tar.gz"
chmod 644 "$out/expo-images.tar.gz"  # mktemp creates 0600; the archive is copied to other laptops
cp data/demo/MANIFEST.json "$out/bundle-MANIFEST.json"
git rev-parse HEAD > "$out/COMMIT"
(cd "$out" && shasum -a 256 expo-images.tar.gz bundle-MANIFEST.json COMMIT > SHA256SUMS)
echo "Release saved to $out; transfer data/demo separately as described in docs/offline.md"
