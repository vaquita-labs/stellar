# Build context: monorepo root
# Build: docker build -f apps/job-deposits/config/job-deposits-app.Dockerfile -t vaquita-job-deposits .

# 1. Imagen base
FROM node:20-alpine

# 2. Instalar pnpm
RUN npm install -g pnpm@10.30.3

# 3. Crear directorio de trabajo
WORKDIR /app

# 4. Copiar manifiestos del workspace
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/job-deposits/package.json apps/job-deposits/

# 5. Instalar dependencias del filtro (job-deposits + shared)
RUN pnpm install --frozen-lockfile --filter @vaquita/job-deposits...

# 6. Copiar código fuente
COPY packages/shared packages/shared
COPY apps/job-deposits apps/job-deposits

# 7. Comando por defecto
WORKDIR /app/apps/job-deposits
CMD ["pnpm", "start"]