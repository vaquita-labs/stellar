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
            \"source\": \"nixpacks-pipeline\",
            \"group_id\": \"${DEPLOY_ID}\"
        }"
}

PHASE=$1
shift # Elimina el primer argumento (la fase) para dejar el resto como el comando a ejecutar

# Deploy group ID: commit SHA si está disponible, sino generamos uno por sesión de build
DEPLOY_ID_FILE="/tmp/.deploy_group_id"
if [ -n "$NIXPACKS_GIT_COMMIT" ]; then
    DEPLOY_ID="${NIXPACKS_GIT_COMMIT:0:8}"
elif [ -n "$GIT_COMMIT" ]; then
    DEPLOY_ID="${GIT_COMMIT:0:8}"
elif git rev-parse --short HEAD > /dev/null 2>&1; then
    DEPLOY_ID=$(git rev-parse --short HEAD)
elif [ -f "$DEPLOY_ID_FILE" ]; then
    DEPLOY_ID=$(cat "$DEPLOY_ID_FILE")
else
    DEPLOY_ID=$(head -c 8 /dev/urandom | xxd -p 2>/dev/null || date +%s | sha256sum | cut -c1-8)
    echo "$DEPLOY_ID" > "$DEPLOY_ID_FILE"
fi

send_webhook "$PHASE" "START" "Iniciando fase..."

# RUNTIME es un proceso que nunca termina — manejo especial
if [ "$PHASE" = "RUNTIME" ]; then
    "$@" &
    SERVER_PID=$!

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
    if [ $EXIT_CODE -ne 0 ]; then
        send_webhook "$PHASE" "ERROR" "Servidor terminó inesperadamente. Código: $EXIT_CODE"
    fi
    exit $EXIT_CODE
fi

# Fases finitas (INSTALL, BUILD, PRISMA...)
if "$@"; then
    send_webhook "$PHASE" "SUCCESS" "Fase completada con éxito."
else
    EXIT_CODE=$?
    send_webhook "$PHASE" "ERROR" "Error en la fase. Código: $EXIT_CODE"
    exit $EXIT_CODE
fi
