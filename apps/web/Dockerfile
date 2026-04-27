# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY notify.sh ./notify.sh
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/

ARG WEBHOOK_SOURCE=apps/web
ENV WEBHOOK_SOURCE=$WEBHOOK_SOURCE

RUN --mount=type=secret,id=webhook_url \
    --mount=type=secret,id=webhook_token \
    sh -c '\
      echo "[DEBUG][deps] webhook_url file exists: $( [ -f /run/secrets/webhook_url ] && echo YES || echo NO )"; \
      echo "[DEBUG][deps] webhook_token file exists: $( [ -f /run/secrets/webhook_token ] && echo YES || echo NO )"; \
      export WEBHOOK_URL="$( [ -f /run/secrets/webhook_url ] && cat /run/secrets/webhook_url )"; \
      export WEBHOOK_TOKEN="$( [ -f /run/secrets/webhook_token ] && cat /run/secrets/webhook_token )"; \
      echo "[DEBUG][deps] WEBHOOK_URL length: ${#WEBHOOK_URL}"; \
      echo "[DEBUG][deps] WEBHOOK_TOKEN length: ${#WEBHOOK_TOKEN}"; \
      echo "[DEBUG][deps] WEBHOOK_SOURCE: $WEBHOOK_SOURCE"; \
      ./notify.sh INSTALL pnpm install --frozen-lockfile --filter vaquiland... \
    '

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .

ARG NEXT_PUBLIC_SERVICES_URL
ARG NEXT_PUBLIC_ABLY_KEY
ARG NEXT_PUBLIC_STELLAR_NETWORK
ARG NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL
ENV NEXT_PUBLIC_SERVICES_URL=$NEXT_PUBLIC_SERVICES_URL
ENV NEXT_PUBLIC_ABLY_KEY=$NEXT_PUBLIC_ABLY_KEY
ENV NEXT_PUBLIC_STELLAR_NETWORK=$NEXT_PUBLIC_STELLAR_NETWORK
ENV NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=$NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL

ARG WEBHOOK_SOURCE=apps/web
ENV WEBHOOK_SOURCE=$WEBHOOK_SOURCE

ENV NEXT_TELEMETRY_DISABLED=1

RUN --mount=type=secret,id=webhook_url \
    --mount=type=secret,id=webhook_token \
    sh -c '\
      echo "[DEBUG][builder] webhook_url file exists: $( [ -f /run/secrets/webhook_url ] && echo YES || echo NO )"; \
      echo "[DEBUG][builder] webhook_token file exists: $( [ -f /run/secrets/webhook_token ] && echo YES || echo NO )"; \
      export WEBHOOK_URL="$( [ -f /run/secrets/webhook_url ] && cat /run/secrets/webhook_url )"; \
      export WEBHOOK_TOKEN="$( [ -f /run/secrets/webhook_token ] && cat /run/secrets/webhook_token )"; \
      echo "[DEBUG][builder] WEBHOOK_URL length: ${#WEBHOOK_URL}"; \
      echo "[DEBUG][builder] WEBHOOK_TOKEN length: ${#WEBHOOK_TOKEN}"; \
      echo "[DEBUG][builder] WEBHOOK_SOURCE: $WEBHOOK_SOURCE"; \
      ./notify.sh BUILD pnpm --filter vaquiland build \
    '

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV WEBHOOK_SOURCE=apps/web

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/notify.sh ./notify.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "./notify.sh RUNTIME-PING true && exec node apps/web/server.js"]