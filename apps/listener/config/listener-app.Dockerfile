# Build context: monorepo root
# Build: docker build -f apps/listener/config/listener-app.Dockerfile -t vaquita-listener .

# 1. Imagen base
FROM node:20-alpine

# 2. Instalar pnpm
RUN npm install -g pnpm@10.30.3

# 3. Crear directorio de trabajo
WORKDIR /app

# 4. Copiar manifiestos del workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/listener/package.json apps/listener/

# 5. Instalar dependencias del filtro (listener + shared)
RUN pnpm install --frozen-lockfile --filter @vaquita/listener...

# 6. Copiar código fuente
COPY packages/shared packages/shared
COPY apps/listener apps/listener

# 7. Comando por defecto
WORKDIR /app/apps/listener
CMD ["pnpm", "start"]