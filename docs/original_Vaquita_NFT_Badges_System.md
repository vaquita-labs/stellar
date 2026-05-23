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

Se mintean al cierre de cada ciclo mensual. Top 3 del leaderboard global del mes. Es la categoría más prestigiosa y la más visible en el feed de amigos.

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
| **Idempotencia** | Categorías C y D verifican que el wallet no haya minteado ya ese subtype. Categorías A y B verifican que no se haya minteado ya ese `(cycle_id, tier)`. |
| **Pull-based claim** | El usuario reclama desde el frontend, paga gas (o se sponsoriza con fee bump). Esto evita mintear para usuarios inactivos. |
| **Ventana de claim** | 30 días desde el evento. Si caduca, el badge no se puede reclamar. |
| **Empate en podio** | Tiebreaker: primero el de mayor `total_completed_cycles`, luego el de menor `last_deposit_timestamp`. |
| **Ganador inactivo** | Si el #1 no reclama en 30 días, el podio NO se reasigna. Queda como `unclaimed` en el contrato. |

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

## 8. Preguntas abiertas para definir

- ¿Score on-chain o off-chain firmado por admin? Off-chain es más simple para v1.
- ¿Storage de imágenes: IPFS, API propia o híbrido? Recomendado: traits relevantes on-chain + JSON via API.
- ¿Qué pasa si un ganador del podio ya no tiene la wallet activa? El claim caduca a 30 días.
- ¿El contrato debe permitir definir nuevas ediciones D vía función admin sin redeploy?
- ¿Soulbound estricto o permitir burn por el owner para que pueda destruir su propio badge?

---

*— Fin del documento —*
