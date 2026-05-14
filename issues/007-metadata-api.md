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

## Acceptance criteria

- [ ] `GET /badge/{token_id}` returns valid NFT JSON metadata for a minted token
- [ ] Returns 404 for unminted token IDs
- [ ] Cat A/B response includes `Tier`, `Rank`, `Cycle`, `Score` attributes
- [ ] Cat C response includes `Milestone`, `Unlocked` attributes
- [ ] Cat D response includes `Edition`, `Serial`, `Max Mint`, `Network` attributes
- [ ] All responses include `Soulbound: true` and `Rarity` attributes
- [ ] `image` field points to `https://vaquita.fi/assets/badges/{badge_type}.png`
- [ ] `external_url` field points to `https://vaquita.fi/badge/{token_id}`

## Blocked by

- Blocked by `issues/001-contract-core-mint-badge-soulbound.md`

## User stories addressed

- Users and third-party explorers can view badge artwork and attributes for any minted token
- Badge metadata is queryable without interacting with the contract directly
