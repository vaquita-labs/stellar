# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY notify.sh ./notify.sh
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json ./apps/admin/

ARG WEBHOOK_SOURCE=apps/admin
ENV WEBHOOK_SOURCE=$WEBHOOK_SOURCE
ARG DEPLOY_ID
ENV DEPLOY_ID=$DEPLOY_ID

RUN --mount=type=secret,id=notification_webhook_url \
    --mount=type=secret,id=notification_webhook_token \
    sh -c '\
      echo "[DEBUG][deps] notification_webhook_url file exists: $( [ -f /run/secrets/notification_webhook_url ] && echo YES || echo NO )"; \
      echo "[DEBUG][deps] notification_webhook_token file exists: $( [ -f /run/secrets/notification_webhook_token ] && echo YES || echo NO )"; \
      export NOTIFICATION_WEBHOOK_URL="$( [ -f /run/secrets/notification_webhook_url ] && cat /run/secrets/notification_webhook_url )"; \
      export NOTIFICATION_WEBHOOK_TOKEN="$( [ -f /run/secrets/notification_webhook_token ] && cat /run/secrets/notification_webhook_token )"; \
      echo "[DEBUG][deps] NOTIFICATION_WEBHOOK_URL length: ${#NOTIFICATION_WEBHOOK_URL}"; \
      echo "[DEBUG][deps] NOTIFICATION_WEBHOOK_TOKEN length: ${#NOTIFICATION_WEBHOOK_TOKEN}"; \
      echo "[DEBUG][deps] WEBHOOK_SOURCE: $WEBHOOK_SOURCE"; \
      echo "[DEBUG][deps] DEPLOY_ID: $DEPLOY_ID"; \
      ./notify.sh INSTALL pnpm install --frozen-lockfile --filter @vaquita/admin... --network-concurrency 4 \
    '

FROM base AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/admin/node_modules ./apps/admin/node_modules
COPY . .

ARG NEXT_PUBLIC_SERVICES_URL
ARG NEXT_PUBLIC_ABLY_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_SERVICES_URL=$NEXT_PUBLIC_SERVICES_URL
ENV NEXT_PUBLIC_ABLY_KEY=$NEXT_PUBLIC_ABLY_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID

ARG WEBHOOK_SOURCE=apps/admin
ENV WEBHOOK_SOURCE=$WEBHOOK_SOURCE
ARG DEPLOY_ID
ENV DEPLOY_ID=$DEPLOY_ID

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NEXT_BUILD_WORKERS=1

RUN --mount=type=secret,id=notification_webhook_url \
    --mount=type=secret,id=notification_webhook_token \
    sh -c '\
      echo "[DEBUG][builder] notification_webhook_url file exists: $( [ -f /run/secrets/notification_webhook_url ] && echo YES || echo NO )"; \
      echo "[DEBUG][builder] notification_webhook_token file exists: $( [ -f /run/secrets/notification_webhook_token ] && echo YES || echo NO )"; \
      export NOTIFICATION_WEBHOOK_URL="$( [ -f /run/secrets/notification_webhook_url ] && cat /run/secrets/notification_webhook_url )"; \
      export NOTIFICATION_WEBHOOK_TOKEN="$( [ -f /run/secrets/notification_webhook_token ] && cat /run/secrets/notification_webhook_token )"; \
      echo "[DEBUG][builder] NOTIFICATION_WEBHOOK_URL length: ${#NOTIFICATION_WEBHOOK_URL}"; \
      echo "[DEBUG][builder] NOTIFICATION_WEBHOOK_TOKEN length: ${#NOTIFICATION_WEBHOOK_TOKEN}"; \
      echo "[DEBUG][builder] WEBHOOK_SOURCE: $WEBHOOK_SOURCE"; \
      echo "[DEBUG][builder] DEPLOY_ID: $DEPLOY_ID"; \
      ./notify.sh BUILD pnpm --filter @vaquita/admin build \
    '

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV WEBHOOK_SOURCE=apps/admin
ARG DEPLOY_ID
ENV DEPLOY_ID=$DEPLOY_ID

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/admin/public ./apps/admin/public
COPY --from=builder --chown=nextjs:nodejs /repo/notify.sh ./notify.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "./notify.sh RUNTIME-PING true && exec node apps/admin/server.js"]
