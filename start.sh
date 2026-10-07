#!/usr/bin/env bash
# ReelMimic — build the UI if needed and start the server on http://localhost:4318
set -e
cd "$(dirname "$0")/app"
# Changed by Lightning Learning Studios, 2026-10-07: say plainly when Node is too old to run the server.
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' || { echo "ReelMimic needs Node 22.18 or newer (this computer has $(node -v)). Install it from https://nodejs.org and run ./start.sh again."; exit 1; }
[ -d node_modules ] || npm install
[ -d dist ] || npm run build
( sleep 2; (command -v xdg-open >/dev/null && xdg-open http://localhost:4318) || (command -v open >/dev/null && open http://localhost:4318) || true ) &
exec node server/index.ts
