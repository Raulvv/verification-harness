#!/usr/bin/env bash
# Fetch ALCE's released datasets (451 MB, pre-retrieved passages).
set -euo pipefail
DEST="$(cd "$(dirname "$0")/../competitive/private/alce" && pwd)"
mkdir -p "$DEST"
cd "$DEST"
if [ -d ALCE-data ]; then
  echo "ALCE-data already present"
  exit 0
fi
curl -L -o ALCE-data.tar https://huggingface.co/datasets/princeton-nlp/ALCE-data/resolve/main/ALCE-data.tar
tar xf ALCE-data.tar
rm ALCE-data.tar
echo "wrote $DEST/ALCE-data"
