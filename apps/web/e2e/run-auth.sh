#!/bin/bash
# Runs the auth + sync end-to-end suite: scratch PostgreSQL (real migrations) -> stand-in Supabase API -> app build -> Playwright.
# The stand-in speaks the GoTrue/PostgREST subset the app uses; see e2e/standin/server.mjs and docs/decisions.md.
set -eu
cd "$(dirname "$0")/.."
export VITE_SUPABASE_URL=http://127.0.0.1:54321
export VITE_SUPABASE_ANON_KEY=$(node -e "import('./e2e/standin/anon.mjs').then(m=>console.log(m.ANON_KEY))")
export VITE_OAUTH_PROVIDERS=
npx vite build --outDir dist-auth --emptyOutDir >/dev/null
bash ../../supabase/tests/scratch_db.sh bash -c '
  node e2e/standin/server.mjs >/tmp/standin.log 2>&1 & S=$!
  npx vite preview --outDir dist-auth --port 4174 --strictPort >/tmp/preview-auth.log 2>&1 & P=$!
  trap "kill $S $P 2>/dev/null" EXIT
  for i in $(seq 40); do curl -sf localhost:4174 >/dev/null && curl -sf localhost:54321/__test/anon >/dev/null && break; sleep 0.5; done
  npx playwright test -c playwright.auth.config.ts "$@"
' _ "$@"
