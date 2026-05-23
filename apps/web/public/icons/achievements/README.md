# Achievement art

Each PNG here is rendered as a `BadgeTile` on `/profile` and `/profile/achievements`.

## Convention

- Filename = the achievement `id` (kebab-case) as defined in
  `apps/web/src/core-ui/data/profile-badges.ts`.
- Format: PNG (or SVG) with a **transparent background**.
- Source size: **256×256 px**. The tile re-scales the image so it nearly
  fills its container; the colored gradient behind it shows as a thin ring.
- Locked badges automatically get `grayscale opacity-60` from the UI, so you
  do not need to ship a "locked" variant.

## Adding a new achievement

1. Add an entry to `buildAchievements()` in
   `apps/web/src/core-ui/data/profile-badges.ts` with a new `id`,
   `title`, `description`, `tier`, `progress`/unlock rule, and `icon`
   pointing at `/icons/achievements/<id>.png`.
2. Drop the artwork here as `<id>.png`.
3. That's it — the trophy room (`/profile/achievements`) and the profile
   summary (`/profile`) pick it up automatically.

## Hooking the backend later

When the backend ships an achievements endpoint, the only file that changes
is `profile-badges.ts` → replace `buildAchievements` with a `useAchievements`
hook that fetches `/api/v1/profile/.../achievements`. The backend response
should include an `icon` URL (relative path like `/icons/achievements/<id>.png`
keeps the art self-hosted; absolute CDN URLs work too once added to
`next.config.ts`'s `images.remotePatterns`). `BadgeTile` / `AchievementModal`
already consume the `Badge` shape, so no UI changes needed.
