#!/usr/bin/env python3 -I
"""Claude Code PreToolUse hook for Bash: refuse any shell command that names an
env file, unless the command is the migration wrapper, which handles the file
without printing it.

The Read tool is already denied those files by `permissions.deny` rules. This
closes the other door: `cat`, `sed`, `grep`, `source`, `node -e` and friends run
through Bash, which those rules do not cover.

Blocked: any token like `.env`, `.env.production`, `.env.staging`, `.envrc`,
and `.env.*.local`. Allowed: `.env.example` (no secrets), and a command that
starts with `scripts/db-migrate.sh` (or `./scripts/db-migrate.sh`, or its
absolute path).

Exit 2 blocks the call and sends stderr back to the model as the reason.
"""
import json
import re
import sys

# `.env` at a token boundary, followed by nothing, `rc`, or a dot and anything
# (so `.env.pro*` and `.env.{staging,production}` count). `.environment`,
# `environment` and `node_modules/.envfoo` do not.
ENV_FILE = re.compile(r"(?:^|[^A-Za-z0-9_])\.env(?:rc|(?![A-Za-z0-9_]))[^\s'\"`;&|)>]*")
ALLOWED_PREFIX = re.compile(r"^\s*(cd\s+\S+\s*&&\s*)?(\./|/[^ ]*/)?scripts/db-migrate\.sh\s")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("tool_name") != "Bash":
        return 0
    command = str(payload.get("tool_input", {}).get("command", ""))

    hits = [m.group(0).strip().lstrip("/'\"=:") for m in ENV_FILE.finditer(command)]
    hits = [h for h in hits if not h.startswith(".env.example")]
    if not hits:
        return 0
    if ALLOWED_PREFIX.match(command) and command.count("\n") == 0 and "&&" not in command.split("db-migrate.sh", 1)[1]:
        return 0

    sys.stderr.write(
        "Blocked: this command references an env file (%s). Env files hold secrets and must not be read, "
        "printed or sourced. For migrations use scripts/db-migrate.sh <env> status|apply|sql, which loads "
        "the file itself and masks its values.\n" % ", ".join(sorted(set(hits)))
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
