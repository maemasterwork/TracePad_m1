#!/bin/bash
# Usage: scratch_db.sh <command...>
# Creates a throw-away PostgreSQL 16 cluster under /tmp (unix socket only, free port), applies shim.sql and every
# migration TWICE (idempotence check) plus seed.sql twice, runs <command> with PGHOST/PGPORT/PGUSER/PGDATABASE
# exported (database "t"), then stops and deletes the cluster. Exit status is the command's.
set -u
HERE=$(cd "$(dirname "$0")" && pwd); SUPA=$(dirname "$HERE")
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
[ -x "$BIN/initdb" ] || { echo "PostgreSQL binaries not found (apt install postgresql-16)"; exit 2; }
RUN=(); if [ "$(id -u)" = 0 ]; then RUN=(runuser -u postgres --); fi
BASE=$(mktemp -d /tmp/tracepad-pg.XXXXXX); chmod 755 "$BASE"; [ ${#RUN[@]} -gt 0 ] && chown postgres "$BASE"
DATA=$BASE/data; SOCK=$BASE/sock
"${RUN[@]}" mkdir -p "$SOCK" "$DATA"; chmod 700 "$DATA" 2>/dev/null
cleanup() { "${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1; rm -rf "$BASE"; }
trap cleanup EXIT
trap 'exit 130' INT TERM
"${RUN[@]}" "$BIN/initdb" -D "$DATA" -U postgres -A trust --no-sync -E UTF8 --locale=C.UTF-8 >"$BASE/initdb.log" 2>&1 \
  || { cat "$BASE/initdb.log"; exit 2; }
PORT=""
for p in 54399 $(seq 54400 54440); do
  if "${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $p -k $SOCK -c listen_addresses= -c fsync=off -c synchronous_commit=off" \
       -l "$BASE/server.log" -w start >/dev/null 2>&1; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "could not start postgres"; cat "$BASE/server.log"; exit 2; }
export PGHOST=$SOCK PGPORT=$PORT PGUSER=postgres PGDATABASE=t
psql -X -q -d postgres -c "create database t" || exit 2
P() { PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "FAILED applying $1"; exit 2; }; }
P "$HERE/shim.sql"
for pass in 1 2; do
  for f in "$SUPA"/migrations/*.sql; do P "$f"; done
  P "$SUPA/seed.sql"
done
echo "applied shim + $(ls "$SUPA"/migrations/*.sql | wc -l) migrations twice (+ seed)"
"$@"
