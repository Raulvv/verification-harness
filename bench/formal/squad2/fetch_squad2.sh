#!/usr/bin/env bash
set -euo pipefail
DEST="$(cd "$(dirname "$0")/../competitive/private/squad2" && pwd)"
mkdir -p "$DEST"
cd "$DEST"
if [ -f dev-v2.0.json ]; then
  echo "dev-v2.0.json already present"
  exit 0
fi
curl -L -o dev-v2.0.json https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v2.0.json
echo "wrote $DEST/dev-v2.0.json"
