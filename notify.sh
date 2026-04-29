#!/bin/sh

SOURCE="${WEBHOOK_SOURCE:-pipeline}"

# [DEBUG] log helper
debug_log() {
    echo "[DEBUG][notify.sh] $*" >&2
}

debug_log "===== notify.sh invoked ====="
debug_log "PHASE arg: $1"
debug_log "Command args (after shift): $(echo "$@" | sed 's/^[^ ]* //')"
debug_log "WEBHOOK_URL is set: $([ -n "$WEBHOOK_URL" ] && echo YES || echo NO) (length=${#WEBHOOK_URL})"
debug_log "WEBHOOK_TOKEN is set: $([ -n "$WEBHOOK_TOKEN" ] && echo YES || echo NO) (length=${#WEBHOOK_TOKEN})"
debug_log "WEBHOOK_SOURCE: $SOURCE"
debug_log "PWD: $(pwd)"
debug_log "Whoami: $(whoami 2>/dev/null || id -un 2>/dev/null || echo unknown)"

send_webhook() {
    phase=$1
    status=$2
    msg=$3

    if [ -z "$WEBHOOK_URL" ]; then
        debug_log "send_webhook[$phase $status]: WEBHOOK_URL vacío, SKIP"
        return 0
    fi

    debug_log "send_webhook[$phase $status]: POST → $WEBHOOK_URL"

    # Captura body + status code para debug
    response=$(curl -s --max-time 5 --retry 2 --retry-delay 1 \
        -w "\n[DEBUG][curl] HTTP_STATUS=%{http_code} TIME=%{time_total}s" \
        -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "x-webhook-token: $WEBHOOK_TOKEN" \
        -d "{
            \"event\": \"${phase}_${status}\",
            \"message\": \"[$phase] $msg\",
            \"source\": \"$SOURCE\",
            \"group_id\": \"${DEPLOY_ID}\"
        }" 2>&1)
    curl_exit=$?

    debug_log "send_webhook[$phase $status]: curl exit=$curl_exit"
    echo "$response" | while IFS= read -r line; do
        debug_log "send_webhook[$phase $status]: response → $line"
    done
}

PHASE=$1
shift # Elimina el primer argumento (la fase) para dejar el resto como el comando a ejecutar

# Deploy group ID: prioridad — env DEPLOY_ID (build-arg propagado por Dokploy), commit SHA, archivo, random
DEPLOY_ID_FILE="/tmp/.deploy_group_id"
if [ -n "$DEPLOY_ID" ]; then
    debug_log "DEPLOY_ID resolved from env: $DEPLOY_ID"
elif [ -n "$NIXPACKS_GIT_COMMIT" ]; then
    DEPLOY_ID=$(printf '%s' "$NIXPACKS_GIT_COMMIT" | cut -c1-8)
    debug_log "DEPLOY_ID resolved from NIXPACKS_GIT_COMMIT: $DEPLOY_ID"
elif [ -n "$GIT_COMMIT" ]; then
    DEPLOY_ID=$(printf '%s' "$GIT_COMMIT" | cut -c1-8)
    debug_log "DEPLOY_ID resolved from GIT_COMMIT: $DEPLOY_ID"
elif git rev-parse --short HEAD > /dev/null 2>&1; then
    DEPLOY_ID=$(git rev-parse --short HEAD)
    debug_log "DEPLOY_ID resolved from git rev-parse: $DEPLOY_ID"
elif [ -f "$DEPLOY_ID_FILE" ]; then
    DEPLOY_ID=$(cat "$DEPLOY_ID_FILE")
    debug_log "DEPLOY_ID resolved from $DEPLOY_ID_FILE: $DEPLOY_ID"
else
    DEPLOY_ID=$(head -c 8 /dev/urandom | xxd -p 2>/dev/null || date +%s | sha256sum | cut -c1-8)
    echo "$DEPLOY_ID" > "$DEPLOY_ID_FILE"
    debug_log "DEPLOY_ID generated random: $DEPLOY_ID"
fi

send_webhook "$PHASE" "START" "Iniciando fase..."

# RUNTIME es un proceso que nunca termina — manejo especial
if [ "$PHASE" = "RUNTIME" ]; then
    debug_log "Entering RUNTIME branch"
    "$@" &
    SERVER_PID=$!
    debug_log "Server started with PID: $SERVER_PID"

    # Reenvía SIGTERM/SIGINT al hijo para graceful shutdown bajo `docker stop`
    trap 'debug_log "Forwarding TERM to PID $SERVER_PID"; kill -TERM "$SERVER_PID" 2>/dev/null' TERM INT

    # Polling hasta que el servidor responda (máx 60s)
    PORT=${PORT:-3000}
    READY=0
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:$PORT" > /dev/null 2>&1; then
            send_webhook "$PHASE" "SUCCESS" "Servidor listo en puerto $PORT."
            READY=1
            break
        fi
        sleep 2
    done

    if [ $READY -eq 0 ]; then
        send_webhook "$PHASE" "ERROR" "Servidor no respondió tras 60s."
    fi

    # Mantener el contenedor vivo hasta que el proceso muera
    wait $SERVER_PID
    EXIT_CODE=$?
    debug_log "RUNTIME server exited with code: $EXIT_CODE"
    # 143 = 128 + SIGTERM: shutdown solicitado por docker stop, no es error
    if [ $EXIT_CODE -ne 0 ] && [ $EXIT_CODE -ne 143 ]; then
        send_webhook "$PHASE" "ERROR" "Servidor terminó inesperadamente. Código: $EXIT_CODE"
    fi
    exit $EXIT_CODE
fi

# Fases finitas (INSTALL, BUILD, PRISMA...)
debug_log "Entering finite-phase branch, executing: $@"
if "$@"; then
    debug_log "Phase $PHASE: command succeeded"
    send_webhook "$PHASE" "SUCCESS" "Fase completada con éxito."
else
    EXIT_CODE=$?
    debug_log "Phase $PHASE: command failed with exit $EXIT_CODE"
    send_webhook "$PHASE" "ERROR" "Error en la fase. Código: $EXIT_CODE"
    exit $EXIT_CODE
fi