#!/usr/bin/env bash
# Run a database migration against one environment without the connection
# string ever being printed, pasted or read by anything but this process.
#
#   scripts/db-migrate.sh <development|staging|production> status
#   scripts/db-migrate.sh <env> apply <migration.sql> [--yes-production]
#   scripts/db-migrate.sh <env> sql                   [--yes-production]
#
#   status  prisma migrate diff: the DDL that separates the live DB from
#           prisma/schema.prisma. Empty output means in sync.
#   apply   packages/db/scripts/apply-migration.mjs for one file in
#           apps/supabase/migrations/.
#   sql     packages/db/scripts/apply-sql.mjs (re-applies the CHECKs).
#
# Why this exists. The env files hold production credentials, and the tools
# that help with migrations (coding agents included) must never see them. So
# the secret only ever moves file → this shell → child process environment. The
# script reads DIRECT_URL from packages/db/.env.<env> (or apps/api/.env.<env>),
# exports it to the child, and masks that value and any `user:password@` in
# everything the child prints, stdout and stderr alike. What it does print is
# the environment name, the host and the database, which is the "am I pointed
# at prod?" check and nothing more.
#
# Writes to production need --yes-production on the command line, so the
# intent is visible in the command itself and not in a prompt nobody sees.
set -euo pipefail
set +x

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 64; }

ENV_NAME="${1:-}"; ACTION="${2:-}"; shift 2 2>/dev/null || usage
case "$ENV_NAME" in development|staging|production) ;; *) usage ;; esac
case "$ACTION" in status|apply|sql) ;; *) usage ;; esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_DIR="$ROOT/packages/db"

MIGRATION=""; YES_PROD=0
for arg in "$@"; do
  case "$arg" in
    --yes-production) YES_PROD=1 ;;
    *.sql) MIGRATION="$arg" ;;
    *) echo "unknown argument: $arg" >&2; usage ;;
  esac
done

# Where the credentials come from. First match wins; the file is never echoed.
ENV_FILE=""
for candidate in "${DB_MIGRATE_ENV_FILE:-}" "$DB_DIR/.env.$ENV_NAME" "$ROOT/apps/api/.env.$ENV_NAME"; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then ENV_FILE="$candidate"; break; fi
done
if [ -z "$ENV_FILE" ]; then
  echo "no env file for '$ENV_NAME' (looked for packages/db/.env.$ENV_NAME and apps/api/.env.$ENV_NAME)" >&2
  exit 66
fi

# Pull exactly one variable out of the file. No `source`: a sourced file can
# run code, and it would also export every other secret in it to the child.
DIRECT_URL="$(grep -E '^DIRECT_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')"
if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL is not set in $(basename "$ENV_FILE") (direct Postgres, port 5432)" >&2
  exit 65
fi

# Host and database for the operator's eyes; the password never leaves this
# variable except as a mask pattern.
HOST="$(printf '%s' "$DIRECT_URL" | sed -E 's#^[a-z]+://([^@]+@)?([^/:?]+).*#\2#')"
DBNAME="$(printf '%s' "$DIRECT_URL" | sed -E 's#^[a-z]+://[^/]+/([^?]+).*#\1#')"
PASSWORD="$(printf '%s' "$DIRECT_URL" | sed -nE 's#^[a-z]+://[^:/]+:([^@]+)@.*#\1#p')"

echo "env=$ENV_NAME  host=$HOST  database=$DBNAME  action=$ACTION${MIGRATION:+  file=$MIGRATION}"

if [ "$ENV_NAME" = production ] && [ "$ACTION" != status ] && [ "$YES_PROD" -ne 1 ]; then
  echo "refusing to write to production without --yes-production" >&2
  exit 75
fi
if [ "$ACTION" = apply ] && [ -z "$MIGRATION" ]; then
  echo "apply needs a migration file name from apps/supabase/migrations/" >&2
  usage
fi
if [ "$ACTION" = apply ] && [ ! -f "$ROOT/apps/supabase/migrations/$MIGRATION" ]; then
  echo "no such migration: apps/supabase/migrations/$MIGRATION" >&2
  exit 66
fi

# Everything the child prints goes through this. It replaces the exact
# connection string, the exact password, and any user:password@ pair, so a
# driver error that quotes the DSN cannot leak it either.
mask() {
  MASK_URL="$DIRECT_URL" MASK_PASSWORD="$PASSWORD" perl -pe '
    BEGIN { $u = $ENV{MASK_URL}; $p = $ENV{MASK_PASSWORD}; }
    s/\Q$u\E/<DIRECT_URL>/g if length $u;
    s/\Q$p\E/<password>/g if length $p;
    s#(://[^:/@\s]+:)[^@\s]+@#$1<password>@#g;
  '
}

cd "$DB_DIR"
export DIRECT_URL
case "$ACTION" in
  status) node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>&1 | mask ;;
  apply)  node scripts/apply-migration.mjs "$MIGRATION" 2>&1 | mask ;;
  sql)    node scripts/apply-sql.mjs 2>&1 | mask ;;
esac
