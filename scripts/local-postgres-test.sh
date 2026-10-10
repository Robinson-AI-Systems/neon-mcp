#!/usr/bin/env bash
# Database tests on a disposable LOCALHOST Postgres — never Neon, never a remote database.
# Adapted from Robinson-AI-Systems/stripe-mcp scripts/local-postgres-test.sh @ f9a54f8 (adds binary discovery and root).
# Usage: npm run test:db [-- tests/db/<file>.test.js ...]
#  - CI: TEST_DATABASE_URL points at the job's throwaway Postgres service (127.0.0.1) and is used as is.
#  - Locally: starts a throwaway cluster from the local initdb/pg_ctl on a random port, runs the tests, deletes it.
set -euo pipefail
export CI=1

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  case "$TEST_DATABASE_URL" in
    postgres://*@127.0.0.1[:/]*|postgresql://*@127.0.0.1[:/]*|postgres://*@localhost[:/]*|postgresql://*@localhost[:/]*) ;;
    *) echo "Refusing TEST_DATABASE_URL: database tests only run against localhost Postgres." >&2; exit 2 ;;
  esac
  exec npx --no-install vitest run --config vitest.db.config.js "$@"
fi

if ! command -v initdb >/dev/null 2>&1; then
  pgbin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -n "$pgbin" && -x "$pgbin/initdb" ]]; then export PATH="$pgbin:$PATH"; fi
fi
for binary in initdb pg_ctl; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    echo "Local Postgres not installed ($binary missing). Push and let CI's throwaway Postgres service run the db job." >&2
    exit 2
  fi
done

# initdb refuses to run as root; use the system 'postgres' account when we are root.
as_pg=()
db_user="$(id -un)"
if [[ "$(id -u)" == "0" ]]; then
  if id postgres >/dev/null 2>&1; then as_pg=(runuser -u postgres --); db_user=postgres
  else echo "Running as root with no 'postgres' user; cannot start a local cluster." >&2; exit 2; fi
fi

tmp="$(mktemp -d)"
chmod 755 "$tmp"
mkdir -p "$tmp/data" "$tmp/sock"
[[ ${#as_pg[@]} -gt 0 ]] && chown -R postgres "$tmp/data" "$tmp/sock"
port="$((20000 + RANDOM % 10000))"
cleanup() {
  "${as_pg[@]}" pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
"${as_pg[@]}" initdb -D "$tmp/data" -A trust -U "$db_user" --no-instructions >/dev/null
"${as_pg[@]}" pg_ctl -D "$tmp/data" -l "$tmp/sock/server.log" \
  -o "-p $port -k $tmp/sock -c listen_addresses=127.0.0.1" -w start >/dev/null
export TEST_DATABASE_URL="postgresql://$db_user@127.0.0.1:$port/postgres"
npx --no-install vitest run --config vitest.db.config.js "$@"
