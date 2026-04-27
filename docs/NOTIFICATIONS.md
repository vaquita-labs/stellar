# Build & Runtime Notifications

This document describes the webhook notification system used across all deployment pipelines in the fan-match monorepo. It covers the script mechanics, required environment variables, nixpacks configuration, and the complete event lifecycle.

---

## Overview

Every deployment phase — install, build, and runtime start — is wrapped by `notify.sh`, a lightweight shell script that fires a webhook POST request before and after each command. This gives you real-time visibility into the deployment pipeline from any HTTP-capable endpoint (Slack, Discord, a custom dashboard, etc.).

```
[phase START] → run command → [phase SUCCESS | phase ERROR]
```

If the wrapped command exits with a non-zero code, the script forwards that exit code after sending the error webhook, so the Docker build fails correctly and the failure is visible both in the logs and in your notification sink.

---

## `notify.sh`

Located at the **monorepo root**: `notify.sh`

```bash
#!/bin/bash

send_webhook() {
    local phase=$1
    local status=$2
    local msg=$3

    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "x-webhook-token: $WEBHOOK_TOKEN" \
        -d "{
            \"event\": \"${phase}_${status}\",
            \"message\": \"[$phase] $msg\",
            \"source\": \"nixpacks-pipeline\"
        }"
}

PHASE=$1
shift

send_webhook "$PHASE" "START" "Iniciando fase..."

if "$@"; then
    send_webhook "$PHASE" "SUCCESS" "Fase completada con éxito."
else
    EXIT_CODE=$?
    send_webhook "$PHASE" "ERROR" "Error en la fase. Código: $EXIT_CODE"
    exit $EXIT_CODE
fi
```

### Usage

```bash
./notify.sh <PHASE_NAME> <command> [args...]
```

| Argument | Description |
|---|---|
| `PHASE_NAME` | Arbitrary label sent in the webhook payload (e.g. `INSTALL`, `BUILD`, `RUNTIME`) |
| `command` | The command to execute (e.g. `pnpm i --frozen-lockfile`) |
| `args` | Any additional arguments forwarded to the command |

### Webhook payload shape

```json
{
  "event": "BUILD_SUCCESS",
  "message": "[BUILD] Fase completada con éxito.",
  "source": "nixpacks-pipeline"
}
```

| Field | Values |
|---|---|
| `event` | `<PHASE>_START` · `<PHASE>_SUCCESS` · `<PHASE>_ERROR` |
| `message` | Human-readable description of the event |
| `source` | Always `"nixpacks-pipeline"` |

---

## File permissions

The script must have the executable bit set **both on disk and in git**. Without this, Docker's `COPY` instruction will copy the file without execute permissions and every phase will fail with `Permission denied`.

Run this once after cloning or after any change to the file:

```bash
chmod +x notify.sh
git update-index --chmod=+x notify.sh
git commit -m "chore: set executable bit on notify.sh"
```

> **Why both?** `chmod +x` fixes the local filesystem. `git update-index --chmod=+x` records mode `100755` in the git object store so every subsequent clone and Docker build context inherits the correct permissions automatically.

---

## Environment variables

Both environment variables must be available at **build time** (i.e. set as build args in Dokploy / your CI provider).

| Variable | Required | Description |
|---|---|---|
| `WEBHOOK_URL` | Yes | Full URL of the endpoint that receives the POST requests |
| `WEBHOOK_TOKEN` | Yes | Secret token sent in the `x-webhook-token` header for request authentication |

### Setting them in Dokploy

1. Open the service → **Environment** tab.
2. Add both variables under **Build variables** (not just runtime variables) so they are available during the Docker build stages.
3. Redeploy.

---

## Nixpacks configuration

Each app in the monorepo has its own `nixpacks.toml`. The pattern is identical across apps — every phase delegates to `notify.sh`.

### `apps/fan-forge/nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs_22", "pnpm-9_x", "openssl", "curl"]

[phases.install]
cmds = ["./notify.sh INSTALL pnpm i --frozen-lockfile"]

[phases.build]
cmds = [
    "./notify.sh PRISMA pnpm --filter fan-forge exec prisma generate",
    "./notify.sh BUILD pnpm --filter fan-forge run build"
]

[start]
cmd = "./notify.sh RUNTIME pnpm --filter fan-forge start"
```

### `apps/chat-api/nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs_22", "pnpm-9_x", "openssl", "curl"]

[phases.install]
cmds = ["./notify.sh INSTALL pnpm i --frozen-lockfile"]

[phases.build]
cmds = [
  "./notify.sh PRISMA pnpm --filter chat-api exec prisma generate",
  "./notify.sh BUILD pnpm --filter chat-api run build"
]

[start]
cmd = "./notify.sh RUNTIME pnpm --filter chat-api start"
```

> `curl` is listed in `nixPkgs` explicitly because it is required by `notify.sh` and may not be present in all Nixpacks base images.

---

## Event lifecycle

The following table shows every webhook event fired during a successful full deployment of a single app.

| Order | Event | Trigger |
|---|---|---|
| 1 | `INSTALL_START` | Before `pnpm i` |
| 2 | `INSTALL_SUCCESS` | After `pnpm i` exits 0 |
| 3 | `PRISMA_START` | Before `prisma generate` |
| 4 | `PRISMA_SUCCESS` | After `prisma generate` exits 0 |
| 5 | `BUILD_START` | Before `next build` |
| 6 | `BUILD_SUCCESS` | After `next build` exits 0 |
| 7 | `RUNTIME_START` | On container start, before `pnpm start` |

On failure, the corresponding `*_ERROR` event fires instead of `*_SUCCESS` and the pipeline stops.

---

## Adding notifications to a new app

1. Ensure `notify.sh` is at the monorepo root with mode `100755` (see [File permissions](#file-permissions)).
2. Create `apps/<your-app>/nixpacks.toml` following the pattern above, replacing the `--filter` flag with your app name.
3. Wrap every command in every phase with `./notify.sh <PHASE> <command>`.
4. Make sure `WEBHOOK_URL` and `WEBHOOK_TOKEN` are set as build variables in your deployment provider.