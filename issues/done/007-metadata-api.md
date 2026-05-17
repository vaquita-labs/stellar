## Parent PRD

`docs/vaquita-badges-whitepaper.md`

## What to build

Build the metadata API endpoint that serves full NFT JSON metadata for any minted badge.
The contract stores only `token_id → owner`; all display metadata (name, description,
image URL, attributes, properties) is served by the API. Images and GLB assets are
hosted on Vaquita's own CDN at `https://vaquita.fi/assets/badges/{badge_type}.png` and
`.glb`.

The endpoint must handle all four badge categories and return the correct attribute set
for each (Category, Tier, Rank, Cycle, Score for A/B; Milestone, Unlocked for C;
Edition, Serial, Max Mint, Network for D).

See §2 (Design Decisions — Metadata), §3 (Badge Catalogue — metadata examples), §6
(Cycle IDs), and FAQ §Metadata and Image Storage of the whitepaper.

## Image assets

Existing PNGs in `apps/web/public/icons/achievements/` map to badge types as follows:

| Badge | File |
|-------|------|
| A1 — Vaquero de Oro | `first-place.png` |
| A2 — Vaquero de Plata | `second-place.png` |
| A3 — Vaquero de Bronce | `third-place.png` |
| B1 — Top 10 Contributor | `month-master.png` |
| C1 — Primera Vaquita | `first-deposit.png` |
| C2 — Maratonista | `century-saver.png` |
| C3 — Trimestral | `trio-saver.png` |
| C4 — Disciplinado | `streak-master.png` |
| C5 — Veterano | `savings-baron.png` |
| D1 — Genesis Saver | `beta-tester2.png` |
| D2 — Mainnet Pioneer | `explorer.png` |
| D3 — Hackathon Champion | `whale.png` |

The `image` field in the metadata JSON should reference these files via the CDN path
`https://vaquita.fi/assets/badges/{filename}`. The files are already present in the
repo and require no new artwork for v1.

## Acceptance criteria

- [ ] `GET /badge/{token_id}` returns valid NFT JSON metadata for a minted token
- [ ] Returns 404 for unminted token IDs
- [ ] Cat A/B response includes `Tier`, `Rank`, `Cycle`, `Score` attributes
- [ ] Cat C response includes `Milestone`, `Unlocked` attributes
- [ ] Cat D response includes `Edition`, `Serial`, `Max Mint`, `Network` attributes
- [ ] All responses include `Soulbound: true` and `Rarity` attributes
- [ ] `image` field for each badge type points to the correct file per the mapping table above
- [ ] `external_url` field points to `https://vaquita.fi/badge/{token_id}`

## Blocked by

- Blocked by `issues/001-contract-core-mint-badge-soulbound.md`

## User stories addressed

- Users and third-party explorers can view badge artwork and attributes for any minted token
- Badge metadata is queryable without interacting with the contract directly
