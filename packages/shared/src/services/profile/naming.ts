/**
 * How a profile is allowed to be named on screen.
 *
 * Every surface that lists people asks a version of the same question — "is
 * there a name to show?" — and each one used to answer it inline, with its own
 * spelling and its own idea of which fields count. The answers legitimately
 * differ: what a surface needs depends on which fields ITS card renders. What
 * does not differ is the fact underneath, and that is what lives here.
 */

/**
 * A profile as far as naming goes.
 *
 * Structural, and it accepts both spellings on purpose: rows reach these checks
 * straight from Prisma (`fullName`) and through `toProfileShape` (`full_name`),
 * and neither caller should have to translate to ask a question this small.
 */
export interface ProfileNaming {
  nickname?: string | null;
  fullName?: string | null;
  full_name?: string | null;
}

/**
 * The core fact: the profile picked a nickname.
 *
 * It is what a public page is keyed by (`/explore/<nickname>`), what a handle
 * renders from, and the one name a stub never has — a profile row is upserted
 * the first time any wallet hits the API, so "a profile exists" says nothing
 * about whether there is a person behind it.
 */
export const hasNickname = (profile: ProfileNaming): boolean => !!(profile.nickname ?? '').trim();

/**
 * There is SOME name to render: the nickname, or the full name.
 *
 * Wider than {@link hasNickname}, and right only where the card can actually
 * draw a full name. Friend suggestions carry `name` and `handle` in their DTO,
 * so a profile with only a full name shows up there as a person. A card that
 * renders the nickname alone — the explore feed — must not use this: the row
 * would arrive with an empty nickname and fall back to `@vaqueroXXXX`, which
 * reads as a broken account.
 */
export const hasDisplayName = (profile: ProfileNaming): boolean =>
  hasNickname(profile) || !!(profile.fullName ?? profile.full_name ?? '').trim();
