# 🏆 Vaquita — Sistema de NFT Badges (Leaderboard)

**Versión 0.1 — Mayo 2026 · Smart Contracts / Producto**

---

## 1. Resumen

Este documento define el sistema completo de NFT badges de Vaquita: todos los tipos de badges que se pueden mintear, bajo qué condiciones, con qué frecuencia, y la metadata sugerida para cada uno. El objetivo es darle a Fabio (smart contracts) la especificación funcional para implementar el contrato NFT en Soroban.

Todos los NFTs son **soulbound** (no transferibles): Vaquita es un sistema de identidad y reputación, no de especulación. El contrato se llama una sola vez para todos los tipos; lo que distingue cada badge es su categoría y metadata.

---

## 2. Catálogo completo de badges

Existen cuatro categorías de NFT badges:

### 2.1 Categoría A — Podio mensual (recurrente)

Se mintean al cierre de cada ciclo mensual. Top 3 del leaderboard global del mes. Es la categoría más prestigiosa y la más visible en el feed de amigos. Usa el mismo modelo de firma Ed25519 que el resto de categorías, con `cycle_id = YYYYMM` incluido en el payload firmado para evitar replay entre ciclos.

| ID | Nombre | Trigger | Frecuencia | Rareza |
|----|--------|---------|------------|--------|
| A1 | 🥇 Vaquero de Oro | Rank #1 del mes | 1×/mes | Legendary |
| A2 | 🥈 Vaquero de Plata | Rank #2 del mes | 1×/mes | Epic |
| A3 | 🥉 Vaquero de Bronce | Rank #3 del mes | 1×/mes | Rare |

**Ejemplo de metadata (Vaquero de Oro):**

```json
{
  "name": "Vaquero de Oro — Mayo 2026",
  "description": "Otorgado al ahorrador #1 del ciclo mensual de Mayo 2026.",
  "image": "ipfs://Qm.../gold-2026-05.png",
  "animation_url": "ipfs://Qm.../gold-2026-05.glb",
  "external_url": "https://vaquita.fi/badge/{token_id}",
  "attributes": [
    { "trait_type": "Category",   "value": "Monthly Podium" },
    { "trait_type": "Tier",       "value": "Gold" },
    { "trait_type": "Rank",       "value": 1 },
    { "trait_type": "Cycle",      "value": "2026-05" },
    { "trait_type": "Score",      "value": 48250 },
    { "trait_type": "Soulbound",  "value": true },
    { "trait_type": "Rarity",     "value": "Legendary" }
  ],
  "properties": {
    "cycle_type":  "monthly",
    "cycle_start": 1746057600,
    "cycle_end":   1748736000,
    "minted_at":   1748736300
  }
}
```

---

### 2.2 Categoría B — Top contributor (recurrente)

Top 10 mensual. Reconocimiento más amplio que complementa al podio. Quien queda #1-3 recibe **ambos**: el badge de podio Y el de top contributor.

| ID | Nombre | Trigger | Frecuencia | Rareza |
|----|--------|---------|------------|--------|
| B1 | 🎖️ Top 10 Contributor | Posición 1-10 del mes | hasta 10×/mes | Uncommon |

**Ejemplo de metadata (Top 10 Contributor):**

```json
{
  "name": "Top 10 Contributor — Mayo 2026",
  "description": "Reconocimiento al ahorrador en el top 10 del ciclo mensual.",
  "image": "ipfs://Qm.../top10-2026-05.png",
  "animation_url": "ipfs://Qm.../top10-2026-05.glb",
  "external_url": "https://vaquita.fi/badge/{token_id}",
  "attributes": [
    { "trait_type": "Category",  "value": "Top Contributor" },
    { "trait_type": "Tier",      "value": "Top10" },
    { "trait_type": "Rank",      "value": 7 },
    { "trait_type": "Cycle",     "value": "2026-05" },
    { "trait_type": "Score",     "value": 22400 },
    { "trait_type": "Soulbound", "value": true },
    { "trait_type": "Rarity",    "value": "Uncommon" }
  ],
  "properties": {
    "cycle_type":  "monthly",
    "cycle_start": 1746057600,
    "cycle_end":   1748736000,
    "minted_at":   1748736300
  }
}
```

---

### 2.3 Categoría C — Hitos personales (one-time per wallet)

Logros individuales que se mintean **una sola vez por wallet** al cumplirse la condición. No dependen del leaderboard, pero son parte del mismo contrato NFT.

| ID | Nombre | Trigger | Frecuencia | Rareza |
|----|--------|---------|------------|--------|
| C1 | 🐮 Primera Vaquita | Completar primer ciclo (cualquier período) | 1×/wallet | Common |
| C2 | 🏃 Maratonista | Completar primer ciclo de 6 meses | 1×/wallet | Rare |
| C3 | 📅 Trimestral | Completar primer ciclo de 3 meses | 1×/wallet | Uncommon |
| C4 | 🔥 Disciplinado | Racha de 30 días consecutivos con actividad | 1×/wallet | Rare |
| C5 | 🎓 Veterano | 12 ciclos completados sin penalty | 1×/wallet | Epic |

**Ejemplo de metadata (Maratonista):**

```json
{
  "name": "Maratonista",
  "description": "Otorgado por completar tu primer ciclo de ahorro de 6 meses en Vaquita.",
  "image": "ipfs://Qm.../milestone-marathon.png",
  "animation_url": "ipfs://Qm.../milestone-marathon.glb",
  "external_url": "https://vaquita.fi/badge/{token_id}",
  "attributes": [
    { "trait_type": "Category",  "value": "Personal Milestone" },
    { "trait_type": "Milestone", "value": "First 6m Cycle" },
    { "trait_type": "Unlocked",  "value": "2026-05-04" },
    { "trait_type": "Soulbound", "value": true },
    { "trait_type": "Rarity",    "value": "Rare" }
  ],
  "properties": {
    "position_id": "POS_8a3f...",
    "minted_at":   1746368000
  }
}
```

---

### 2.4 Categoría D — Eventos especiales (limitados)

Edición limitada por temporada o campaña. Ej. lanzamiento mainnet, hackathons, alianzas. El contrato debe poder definir nuevas ediciones D vía función admin.

| ID | Nombre | Trigger | Frecuencia | Rareza |
|----|--------|---------|------------|--------|
| D1 | ⭐ Genesis Saver | Primeros 50 wallets del beta | 1×/wallet, máx 50 | Legendary |
| D2 | 🚀 Mainnet Pioneer | Primer depósito en mainnet día 1-7 | 1×/wallet, ventana fija | Epic |
| D3 | 🏆 Hackathon Champion | Eventos especiales | variable | Epic |

**Ejemplo de metadata (Genesis Saver):**

```json
{
  "name": "Genesis Saver — Vaquita Beta",
  "description": "Una de las primeras 50 wallets en participar del beta público de Vaquita en testnet.",
  "image": "ipfs://Qm.../genesis-saver.png",
  "animation_url": "ipfs://Qm.../genesis-saver.glb",
  "external_url": "https://vaquita.fi/badge/{token_id}",
  "attributes": [
    { "trait_type": "Category",  "value": "Limited Edition" },
    { "trait_type": "Edition",   "value": "Genesis" },
    { "trait_type": "Serial",    "value": 23 },
    { "trait_type": "Max Mint",  "value": 50 },
    { "trait_type": "Network",   "value": "testnet" },
    { "trait_type": "Soulbound", "value": true },
    { "trait_type": "Rarity",    "value": "Legendary" }
  ],
  "properties": {
    "edition_start": 1745366400,
    "edition_end":   1750118400,
    "minted_at":     1745452800
  }
}
```

---

## 3. Esquema de identificación

Cada NFT tiene un `token_id` único secuencial. Para el indexer y el contrato, se distingue por `category` + `metadata`:

```
token_id   → único, secuencial (1, 2, 3...)
category   → "monthly_podium" | "top_contributor" | "personal_milestone" | "limited_edition"
subtype    → "gold" | "silver" | "bronze" | "top10" | "marathon" | "genesis" | etc.
cycle_id   → solo si aplica (categorías A y B)
owner      → wallet address (soulbound, no cambia)
```

---

## 4. Reglas de minteo

| Regla | Aplicación |
|-------|------------|
| **Soulbound** | Todos los NFTs son no-transferibles. `transfer()` siempre revierte con error `SoulboundToken`. |
| **Idempotencia** | Todas las categorías usan la clave `Claimed(badge_type, cycle_id, wallet)`. Cat C/D usan `cycle_id = 0`. |
| **Firma admin** | Todos los badges requieren firma Ed25519 del backend sobre `(wallet, badge_type, cycle_id, expiry)`. |
| **Pull-based claim** | El usuario reclama desde el frontend, paga gas (o se sponsoriza con fee bump). Esto evita mintear para usuarios inactivos. |
| **Ventana de claim** | 30 días desde el evento (controlado por el campo `expiry` en la firma). Si caduca, la firma es inválida. |
| **Empate en podio** | Tiebreaker: primero el de mayor `total_completed_cycles`, luego el de menor `last_deposit_timestamp`. |
| **Ganador inactivo** | Si el #1 no reclama antes del `expiry`, la firma caduca. El podio NO se reasigna. |

---

## 5. Volumen estimado de minteo

Proyección con 200 wallets activos al final de T3 (mainnet launch):

| Categoría | Mintings/mes | Mintings/año |
|-----------|:------------:|:------------:|
| A — Podio mensual | 3 | 36 |
| B — Top 10 | 10 | 120 |
| C — Hitos personales | ~50 (variable) | ~600 |
| D — Eventos limitados | 0-50 (esporádico) | ~100 |
| **Total estimado** | **~63** | **~856** |

---

## 6. Atributos comunes a todos los badges

Sin importar la categoría, todo badge incluye:

```json
{
  "name": "...",
  "description": "...",
  "image": "ipfs://...",
  "animation_url": "ipfs://...",
  "external_url": "https://vaquita.fi/badge/{token_id}",
  "attributes": [
    { "trait_type": "Category",  "value": "..." },
    { "trait_type": "Soulbound", "value": true },
    { "trait_type": "Rarity",    "value": "..." }
  ],
  "properties": {
    "minted_at": "<unix>",
    "minter":    "<admin_address>"
  }
}
```

Lo que cambia entre categorías son los traits específicos:

- **Categorías A y B:** `Tier`, `Rank`, `Cycle`, `Score`
- **Categoría C:** `Milestone`, `Unlocked`
- **Categoría D:** `Edition`, `Serial`, `Max Mint`, `Network`

---

## 7. Resumen visual del sistema

```
                    ┌─────────────────────────────────┐
                    │  Vaquita NFT Badges (Soulbound) │
                    └─────────────────┬───────────────┘
                                      │
        ┌───────────────┬─────────────┴──────────────┬─────────────────┐
        │               │                            │                 │
   A. PODIO        B. TOP 10                  C. HITOS           D. LIMITADOS
   (mensual)       (mensual)                  (one-time)         (ventana)
        │               │                            │                 │
   ┌────┴────┐          │                ┌───────────┼───────────┐     │
   │         │          │                │           │           │     │
  🥇        🥈         🥉              🐮          🏃          🔥   ...  ⭐
  Gold     Silver     Bronze        Primera     Maratón     Disciplina  Genesis
                                    Vaquita     6 meses     30 días    Saver
```

---

## 8. FAQ — Decisiones de diseño

### Categoría D — Elegibilidad

**¿Cómo se decide quién recibe el Genesis Saver (D1)?**
FIFO on-chain puro: las primeras 50 wallets que ejecuten un depósito en testnet reciben el badge. El backend lleva un contador; al llegar a 50 deja de firmar claims D1. No hay whitelist manual ni reservas para el equipo.

**¿Hay cap numérico para Mainnet Pioneer (D2)?**
No. Cualquier wallet con primer depósito en mainnet dentro de los días 1–7 recibe el badge, sin límite de cantidad. El criterio es temporal, no posicional.

**¿Las wallets que usaron testnet califican para Mainnet Pioneer (D2)?**
Sí. La condición es el primer depósito en mainnet en la ventana de 7 días. El historial en testnet no descalifica ni condiciona.

---

### `badge_type` — Tipado

**¿`badge_type` es un enum cerrado on-chain o un Symbol libre?**
Symbol libre controlado por el backend. El contrato solo verifica la firma Ed25519 — no tiene whitelist de tipos válidos. La whitelist vive en el backend, lo que permite añadir nuevas ediciones D sin hacer upgrade del contrato.

---

### `transfer()` — Soulbound

**¿Hay algún caso donde se permita transferir un badge (wallet perdida, migración)?**
No. `transfer()` revierte siempre con `SoulboundToken`, sin excepciones. Si un usuario pierde su wallet, el badge se pierde. Una función de migración (burn + re-mint) podría añadirse en versiones futuras si hay demanda, pero no está en scope para v1.

---

### Custodia de la admin key

**¿Cómo se custodia la clave que firma los claims?**
En v1 (testnet y beta): clave única almacenada en `.env` del backend. Antes del launch en mainnet se migra a 2-of-3 multisig. El criterio de migración es el que ocurra primero: TVL supera $10k o inicio del primer ciclo mensual completo en mainnet. La rotación vía `update_signing_key` queda restringida al CTO + un segundo firmante desde el deploy en mainnet.

---

### `expiry` — Ventana de claim y re-emisión

**¿Qué es `expiry` y dónde se enforcea?**
`expiry` es un timestamp incluido en el payload firmado por el backend. El contrato verifica `ledger::timestamp() < expiry` antes de aceptar el claim. El backend controla la ventana (default: 30 días desde el evento); el contrato la enforcea.

**¿El badge en sí expira?**
No. `expiry` es solo el deadline de la firma, no del badge. Una vez minteado, el badge es permanente.

**¿Qué pasa si el usuario deja pasar el expiry de un Cat A/B/C?**
El backend re-emite la firma de forma transparente bajo demanda. Desde la perspectiva del usuario, el claim siempre está disponible. La política de re-emisión es: automática para Cat A, B y C (la elegibilidad es permanente una vez ganada); manual y discrecional del equipo para Cat D.

**¿Por qué no usar `expiry = MAX` para evitar toda esta lógica?**
El expiry corto limita el blast radius si la admin key es comprometida: rotar la clave invalida todas las firmas pendientes en máximo 30 días. Sin expiry, una key comprometida permite mintear badges arbitrarios para siempre, incluso después de rotar.

---

### Fee bumping

**¿Quién paga el gas del claim?**
El fee bumping está delegado a la integración de Privy + Pollar. Responsable de implementación: Oscar Gauss.

---

### Storage de metadata e imágenes

**¿Dónde se hostean las imágenes y el JSON de metadata?**
API propia de Vaquita (`https://vaquita.fi/badge/{token_id}`). Control total sobre imágenes y metadata, sin dependencia de IPFS o pinning externo.

---

### Timeline

**¿Cuándo se deploya el contrato NFT en testnet?**
Al cierre de Tranche 2, Week 16.

---

*— Fin del documento —*
