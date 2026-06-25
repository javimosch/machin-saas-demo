#!/usr/bin/env bash
# Build MachNotes into one native binary.
set -euo pipefail
cd "$(dirname "$0")"
machin encode src/machweb.src src/sso.src src/postgres.src src/redis.src src/app.src > app.mfl
machin build app.mfl -o machnotes
echo "built ./machnotes — run it, then open http://localhost:48190"
