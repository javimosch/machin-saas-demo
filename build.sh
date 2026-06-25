#!/usr/bin/env bash
# Build MachNotes: a reactive wasm client + a native server binary that serves it.
# Needs machin, a C compiler, and zig (the C->wasm compiler for --target wasm).
set -euo pipefail
cd "$(dirname "$0")"
MACHIN="${MACHIN:-machin}"

# 1. wasm CLIENT: the reactive runtime + the view.
"$MACHIN" encode src/reactive.src src/client.src > client.mfl
"$MACHIN" build client.mfl --target wasm -o app.wasm
echo "built ./app.wasm ($(wc -c < app.wasm) bytes)"

# 2. embed the JS host as host_js().
python3 - <<'PY' > src/host_gen.src
import json
print('func host_js() (s) { s = ' + json.dumps(open('web/host.js').read()) + ' }')
PY

# 3. native SERVER: the frameworks + app + the embedded host.
"$MACHIN" encode src/machweb.src src/sso.src src/postgres.src src/redis.src src/app.src src/host_gen.src > server.mfl
"$MACHIN" build server.mfl -o machnotes
echo "built ./machnotes — run it (PORT=… IDP_PORT=… to override the defaults 48190/48191)"
