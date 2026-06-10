# Seguridad del API: validación de avatares + sesión de wallet (y pendientes)

> Implementado el 2026-06-09 (commit `7614f78`). Este documento explica qué se hizo,
> cómo funciona, y deja la lista de endpoints que AÚN faltan por proteger.

## 1. Qué se implementó

### 1.1 Validación de avatares (anti "código disfrazado de foto")

Antes el API confiaba en el `Content-Type` que declaraba el navegador: cualquiera
podía subir HTML/scripts diciendo "esto es un PNG" y se guardaba tal cual en MinIO.

Ahora (`apps/api/src/routes/profile/route.ts`, función `processAvatarImage`):

- **sharp decodifica los píxeles reales.** Si el archivo no es una imagen de
  verdad (HTML, script, PDF…), la decodificación falla → 400. El nombre y el
  mimetype declarado no importan.
- **Nunca se guardan los bytes del usuario.** El servidor re-codifica a WebP de
  máx. 512×512 y almacena SU salida. Todo lo que no sea píxeles desaparece:
  EXIF/GPS, ICC, payloads pegados al final del archivo (polyglots).
- **Bloqueos específicos:** SVG (puede traer `<script>`) → rechazado aunque
  sharp sepa rasterizarlo; bombas de descompresión → `limitInputPixels` 8192²;
  5 MB máx. lo corta multer antes de procesar; solo JPG/PNG/WEBP/GIF.
- El frontend muestra los requisitos ("JPG, PNG, WEBP o GIF · máx. 5 MB") y
  valida lo mismo antes de subir (solo UX — la seguridad es del servidor).

Probado con ataques reales: HTML-como-PNG, SVG con script, PNG+script appendeado,
imagen de 81 MP — todos rechazados o neutralizados.

### 1.2 Sesión de wallet para mutaciones de perfil

Antes el API era "wallet-trust": el `:walletAddress` de la URL ERA la identidad,
sin autenticación — cualquiera podía cambiar la foto/perfil de cualquiera.

Ahora las **9 mutaciones** de `/api/v1/profile/wallet/:walletAddress/*` (avatar
POST/DELETE, nickname, profile, flags, preferences, notification-preferences,
map-objects, gold-daily-collect) exigen `Authorization: Bearer <JWT>`.

**Flujo completo** (la verificación ocurre ANTES de procesar la imagen):

```
1. authFetch (web) revisa localStorage: ¿token vigente?
   ├─ SÍ  → salta al paso 5
   └─ NO  → login (2-4), una vez cada 7 días
2. POST /auth/challenge        → el API crea la transacción-challenge
3. Pollar signTx firma el challenge:
   ├─ custodial (email/Google): la clave vive en el KMS de Pollar; su API firma
   │  server-side autenticada con la sesión DPoP del usuario. Sin popup.
   └─ wallet externo (Freighter/xBull): popup de firma de la extensión.
4. POST /auth/verify           → valida la firma y emite JWT HS256 (7 días)
5. La mutación sale con Authorization: Bearer <token>
6. requireWalletSession valida el token y que su wallet == :walletAddress
   ANTES de que el handler corra. Inválido/ajeno → 401/403.
```

**La transacción-challenge** (NO es SEP-10 estándar, a propósito):

- `tx.source` = la cuenta del USUARIO — el firmador custodial de Pollar rechaza
  cualquier tx cuyo source no sea la propia cuenta ("tx.source debe coincidir
  con publicKey"); SEP-10 clásico usa la cuenta del servidor y por eso fallaba.
- **secuencia 0** → inejecutable on-chain por construcción (las secuencias
  reales empiezan en `ledgerSeq << 32`). No mueve fondos; solo porta la firma.
- una operación `manageData` (`vaquita.app auth` = nonce aleatorio de 32 bytes).
- La autenticidad que en SEP-10 da la firma del servidor aquí la da el **registro
  de nonces de un solo uso** en memoria del API: solo se aceptan challenges que
  el servidor emitió, para ese wallet, dentro de 5 min, y verificar consume el
  nonce (anti-falsificación + anti-replay).

**Archivos:**

| Archivo | Rol |
|---|---|
| `apps/api/src/lib/walletAuth.ts` | challenge, verificación, JWT, middleware |
| `apps/api/src/routes/auth/route.ts` | `POST /auth/challenge`, `POST /auth/verify` |
| `apps/web/src/networks/stellar/walletSession.ts` | cache del token (localStorage `vaquita-wallet-session`), login single-flight, retry en 401, nunca lanza por fallo de login (la petición sale sin token y el caller ve el 401 JSON normal) |
| `apps/web/src/core-ui/hooks/profile/useRestProfile.ts` | todas las mutaciones usan `authFetch` |

**Env (apps/api):** `AUTH_SESSION_SECRET` (HMAC del JWT; efímero si falta →
reinicio desloguea a todos), `AUTH_HOME_DOMAIN` (default `vaquita.app`),
`WALLET_AUTH_ENFORCE=false` = modo solo-advertencia (escape hatch).

**Pruebas e2e que pasan:** sin token → 401; replay del challenge → 401; challenge
auto-fabricado → 401; firma con clave equivocada → 401; nonce de otro wallet →
401; token de A contra wallet B → 403; mutación legítima → 200.

## 2. PENDIENTES — endpoints que aún hay que proteger

Auditoría del 2026-06-09. Orden por riesgo:

### Alto

- [ ] **Badges** `POST /wallets/:wallet/badges/redeem` y `POST .../:key/claim` —
  cualquiera puede canjear códigos o reclamar logros (que acreditan monedas) a
  nombre de otro wallet, y hacer fuerza bruta de redeem-codes. Aplicar
  `requireWalletSession` (ojo: el param se llama `:wallet`, no `:walletAddress`
  — ajustar el middleware o usar `mergeParams`).
- [ ] **Deposits** `POST /deposit`, `/confirm`, `/fail`, `/withdraw`,
  `/withdraw-confirm` — sin auth y el wallet va en el BODY. Permite insertar
  depósitos falsos o confirmar/fallar depósitos ajenos con un txHash inventado
  (riesgo de inflar leaderboard/XP/badges). Más delicado: hay que comparar el
  wallet del token contra el del body sin romper el flujo real de depósito, y
  revisar si el `listener` reconcilia contra la red de verdad.
- [ ] **Admin fail-closed** — `apps/api/src/routes/admin/route.ts`: si
  `ADMIN_SECRET` no está configurado, los endpoints de admin quedan ABIERTOS
  (`if (!secret) return true`). Cambiar a: sin secret → rechazar siempre (salvo
  entorno de desarrollo explícito).

### Medio / bajo

- [ ] **Follows** `POST/DELETE /follows/wallet/:walletAddress/follow...` —
  cualquiera puede hacer que un usuario siga/deje de seguir a quien sea.
  Mismo middleware, fix directo.
- [ ] **Notifications** `POST .../read`, `.../read-all` — marcar leídas las
  notificaciones de otro. Molesto más que peligroso. Mismo middleware.

### Infraestructura / hardening

- [ ] **Nonce store multi-instancia**: los nonces del challenge viven en memoria
  del proceso. Con varias instancias del API detrás de un balanceador,
  challenge y verify deben caer en el mismo proceso → mover a Postgres/Redis
  cuando se escale horizontalmente.
- [ ] **Rate-limiting** en `/auth/challenge` y `/auth/verify` (hoy se pueden
  llamar sin límite; el costo es bajo pero es higiene básica).
- [ ] Configurar `AUTH_SESSION_SECRET` real en producción (documentado en
  `.env.example`; en dev ya está en `apps/api/.env`).
- [ ] Probar el flujo completo con un **wallet externo** (Freighter/xBull) —
  el custodial ya quedó verificado; el externo debería mostrar su popup de
  firma una vez cada 7 días.
