#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
cd tests/e2e
bun install --frozen-lockfile
bunx playwright test
cd "$root"
video="$(find tests/e2e/test-results -name video.webm -type f -print -quit)"
test -n "$video"
mkdir -p data/demo
cp "$video" data/demo/fallback_recording.webm
if command -v ffmpeg >/dev/null; then
  ffmpeg -y -i data/demo/fallback_recording.webm -c:v libx264 -pix_fmt yuv420p data/demo/fallback_recording.mp4
fi
