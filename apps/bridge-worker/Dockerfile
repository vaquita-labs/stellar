# syntax=docker.io/docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/bridge-worker/package.json ./apps/bridge-worker/
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter @vaquita/bridge-worker...

FROM node:22-alpine AS runner
WORKDIR /repo
RUN corepack enable

ENV NODE_ENV=production

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/bridge-worker/node_modules ./apps/bridge-worker/node_modules
COPY --from=deps /repo/packages ./packages
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/bridge-worker ./apps/bridge-worker

CMD ["pnpm", "--filter", "@vaquita/bridge-worker", "start"]
