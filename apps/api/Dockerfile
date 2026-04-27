# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY notify.sh ./notify.sh
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages

ARG WEBHOOK_SOURCE=apps/api
ENV WEBHOOK_SOURCE=$WEBHOOK_SOURCE

RUN --mount=type=secret,id=webhook_url \
    --mount=type=secret,id=webhook_token \
    WEBHOOK_URL="$( [ -f /run/secrets/webhook_url ] && cat /run/secrets/webhook_url )" \
    WEBHOOK_TOKEN="$( [ -f /run/secrets/webhook_token ] && cat /run/secrets/webhook_token )" \
    ./notify.sh INSTALL pnpm install --frozen-lockfile --filter @vaquita/api...

FROM base AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV WEBHOOK_SOURCE=apps/api
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 apiuser

COPY --from=deps --chown=apiuser:nodejs /repo/node_modules ./node_modules
COPY --from=deps --chown=apiuser:nodejs /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps --chown=apiuser:nodejs /repo/packages ./packages
COPY --chown=apiuser:nodejs pnpm-workspace.yaml package.json ./
COPY --chown=apiuser:nodejs apps/api ./apps/api
COPY --chown=apiuser:nodejs notify.sh ./notify.sh

USER apiuser

EXPOSE 3000

CMD ["sh", "-c", "./notify.sh RUNTIME-PING true && exec pnpm --filter @vaquita/api start"]