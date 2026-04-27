# Dokploy — Guía de despliegue para `apps/web`

Esta guía documenta cómo configurar correctamente las variables de entorno en Dokploy para desplegar `apps/web` (Next.js) y evita el error de validación de Zod en build:

```
❌ Error en configuración de variables de entorno:
  NEXT_PUBLIC_SERVICES_URL: 'Too small: expected string to have >=1 characters'
  NEXT_PUBLIC_ABLY_KEY: 'Too small: expected string to have >=1 characters'
```

## Las 3 secciones de variables en Dokploy

Dokploy expone 3 lugares distintos para definir variables. La diferencia es **cuándo** están disponibles y **cómo** se inyectan al contenedor.

| Sección | Disponibilidad | Mecanismo | Uso típico |
|---|---|---|---|
| **1. Environment Settings** | Runtime (proceso corriendo) | Variables de entorno del proceso | `DATABASE_URL`, `NODE_ENV`, secrets server-side |
| **2. Build-time Arguments** | Solo durante `docker build` | `--build-arg` → requiere `ARG` en Dockerfile | Valores no sensibles que se compilan en el bundle (`NEXT_PUBLIC_*`) |
| **3. Build-time Secrets** | Solo durante `docker build` | BuildKit secrets (`--secret id=...`) → montados como archivo, no quedan en capas | Tokens privados que se necesitan al buildear pero no deben quedar en la imagen |

### Build-time Arguments vs Build-time Secrets

- **Build-time Arguments**: quedan registrados en el historial de la imagen (`docker history`) — son visibles. Úsalos para valores públicos (URLs, IDs, claves públicas).
- **Build-time Secrets**: se montan temporalmente en `/run/secrets/<id>` durante un `RUN` específico y **no quedan en la imagen final**. Requieren sintaxis especial en el Dockerfile:
  ```dockerfile
  RUN --mount=type=secret,id=webhook_token \
      --mount=type=secret,id=webhook_url \
      WEBHOOK_TOKEN="$(cat /run/secrets/webhook_token)" \
      WEBHOOK_URL="$(cat /run/secrets/webhook_url)" \
      ./notify.sh BUILD pnpm --filter vaquiland build
  ```

## Regla práctica

- ¿Empieza con `NEXT_PUBLIC_`? → **Build-time Arguments**
- ¿Es un secret de servidor leído en runtime (DB, JWT secret, API key privada)? → **Environment Settings**
- ¿Es un secret necesario durante `docker build` que no debe quedar en la imagen? → **Build-time Secrets**

## Configuración para `apps/web`

El `Dockerfile` declara `ARG` para las `NEXT_PUBLIC_*` y consume secrets vía `--mount=type=secret` para el webhook de notificaciones.

### Build-time Arguments

```env
NEXT_PUBLIC_SERVICES_URL=https://tu-api.dominio.com
NEXT_PUBLIC_ABLY_KEY=tu_ably_publishable_key
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

> ⚠️ Sobre `NEXT_PUBLIC_ABLY_KEY`: las variables `NEXT_PUBLIC_*` terminan en el JS del cliente y son visibles públicamente. Asegúrate de usar una **publishable key** de Ably (con capacidades limitadas), nunca una root key con `publish + subscribe + admin`.

### Build-time Secrets

Para las notificaciones de build (`notify.sh`):

| ID del secret | Valor |
|---|---|
| `webhook_url` | URL del receptor de webhooks |
| `webhook_token` | Token enviado en `x-webhook-token` |

Estos solo se necesitan durante `docker build` para reportar `INSTALL_*` y `BUILD_*`. **No quedan en la imagen final**.

### Environment Settings (runtime)

Para que el contenedor pueda emitir `RUNTIME-PING_START` al arrancar:

```env
WEBHOOK_URL=https://tu-receptor.dominio.com/hook
WEBHOOK_TOKEN=tu_token
```

Si los omites, `notify.sh` simplemente no envía nada (la app arranca igual).

> El Dockerfile ya define `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `WEBHOOK_SOURCE=apps/web`. No hace falta duplicarlos.

## Por qué falla si las `NEXT_PUBLIC_*` se ponen solo en Environment Settings

Si pones `NEXT_PUBLIC_SERVICES_URL` solo en *Environment Settings*, Dokploy la inyecta en runtime, pero **no** la pasa a `docker build` como `--build-arg`. Como `next build` valida con Zod (`z.string().min(1)`) en `apps/web/src/core-ui/config/clientEnv.ts`, el build falla al pre-renderizar `/_not-found` con strings vacíos.

## Notificaciones de build con `notify.sh`

El monorepo usa `/notify.sh` (raíz) para emitir webhooks granulares por fase: `INSTALL_START`, `INSTALL_SUCCESS`, `BUILD_START`, `BUILD_SUCCESS`, `RUNTIME-PING_START`, etc. Detalles del payload en [`docs/NOTIFICATIONS.md`](./NOTIFICATIONS.md).

### Cómo se inyectan los secrets en build

El `Dockerfile` usa BuildKit secrets:

```dockerfile
RUN --mount=type=secret,id=webhook_url \
    --mount=type=secret,id=webhook_token \
    WEBHOOK_URL="$( [ -f /run/secrets/webhook_url ] && cat /run/secrets/webhook_url )" \
    WEBHOOK_TOKEN="$( [ -f /run/secrets/webhook_token ] && cat /run/secrets/webhook_token )" \
    ./notify.sh INSTALL pnpm install --frozen-lockfile --filter vaquiland...
```

- El `[ -f ... ] &&` permite que el build no falle si los secrets no están definidos (modo dev local sin webhook).
- `notify.sh` chequea `WEBHOOK_URL` vacía y hace early-return → sin webhook configurado, el comando se ejecuta normal sin overhead.

### Runtime: `RUNTIME-PING` con `exec`

El `CMD` del Dockerfile es:

```dockerfile
CMD ["sh", "-c", "./notify.sh RUNTIME-PING true && exec node apps/web/server.js"]
```

- `notify.sh RUNTIME-PING true` dispara un evento `RUNTIME-PING_START` y termina inmediatamente.
- `exec node ...` reemplaza el shell con Node → **Node es PID 1** → recibe `SIGTERM` directamente y maneja graceful shutdown.
- No usamos el manejo `RUNTIME` completo del script (con health polling) porque eso dejaría bash como PID 1; preferimos delegar el health a `HEALTHCHECK` de Docker o al orquestador.

### Hardening aplicado a `notify.sh`

- `curl` con `--max-time 5 --retry 2 --retry-delay 1` para que un receptor lento/caído no bloquee el build.
- Output del `curl` silenciado (`> /dev/null 2>&1 || true`) — los errores de webhook no rompen el build.
- Variable `WEBHOOK_SOURCE` (default `pipeline`) configurable por app para distinguir el origen en el receptor.
- En la fase `RUNTIME` (usada por otras apps via nixpacks): `trap` que reenvía `SIGTERM`/`SIGINT` al proceso hijo para graceful shutdown.
- Compatible con `/bin/sh` (busybox/ash en Alpine, dash en Ubuntu) — antes solo funcionaba con bash.

## Checklist de despliegue de `apps/web`

1. En Dokploy → tu aplicación → pestaña **Environment**.
2. **Build-time Arguments**: las 4 `NEXT_PUBLIC_*`.
3. **Build-time Secrets**: `webhook_url`, `webhook_token` (solo si quieres notificaciones de build).
4. **Environment Settings**: `WEBHOOK_URL`, `WEBHOOK_TOKEN` (solo si quieres `RUNTIME-PING` al arrancar).
5. Redeploy. El `next build` debe completar sin el error de Zod.

## Referencias

- Build args en Docker: https://docs.docker.com/build/building/variables/#build-arguments
- BuildKit secrets: https://docs.docker.com/build/building/secrets/
- Variables públicas de Next.js: https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser