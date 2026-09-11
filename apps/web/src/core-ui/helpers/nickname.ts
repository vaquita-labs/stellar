// Vaquitatag rules, mirrored from the API (apps/api/src/lib/nicknamePolicy.ts).
// The tag doubles as the public profile URL segment (/leaderboard/<tag> and
// /explore/<tag>) and as the invite code, so the charset is restricted to
// URL-safe lowercase letters and digits. No '@', no underscore, no spaces, no
// accents, no emoji.
//
// Two bounds, not one, and they are not interchangeable:
//
// - STORABLE, up to 32 characters. What may already exist in the database, and
//   therefore what every READ path has to keep resolving. Names predating the
//   15-character cap are grandfathered: breaking someone's identity to enforce
//   a new rule is not worth it.
// - WRITABLE, up to 15 characters. What a user may type today. A tag is read
//   across a table at an event, so it has to be short enough to say.
//
// This is UX only — the API re-validates every write, so a crafted request
// still gets rejected there.

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 32;
export const NICKNAME_NEW_MAX_LENGTH = 15;
export const NICKNAME_FORMAT_REGEX = /^[a-z0-9]{3,32}$/;
export const NICKNAME_NEW_FORMAT_REGEX = /^[a-z0-9]{3,15}$/;

/**
 * Strips anything a tag may not contain, so typing "@Juan Pérez!" leaves
 * "juanperez".
 *
 * Accents are folded to their base letter (NFKD + drop combining marks) rather
 * than dropped, so "Pérez" becomes "perez" and not "prez".
 *
 * Cuts at the STORABLE bound, because this is also what `nicknameSegment` uses
 * to clean a tag someone else owns. Truncating here to 15 would make every
 * grandfathered long tag unresolvable. For an input's onChange use
 * `sanitizeNewNickname`.
 */
export function sanitizeNickname(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, NICKNAME_MAX_LENGTH);
}

/**
 * Same cleanup at the WRITABLE bound. Meant for an input's onChange: the field
 * can never hold a value the API would reject.
 */
export function sanitizeNewNickname(value: string): string {
  return sanitizeNickname(value).slice(0, NICKNAME_NEW_MAX_LENGTH);
}

/** Does this tag still resolve? Use for anything read, never for a write. */
export function isNicknameFormatValid(nickname: string): boolean {
  return NICKNAME_FORMAT_REGEX.test(nickname);
}

/** May the user save this tag? Use for every input and every write. */
export function isNewNicknameFormatValid(nickname: string): boolean {
  return NICKNAME_NEW_FORMAT_REGEX.test(nickname);
}

/**
 * Lleva lo que el usuario escribió al segmento que la API espera en
 * `/profile/nickname/:nickname`. El `@` es una convención nuestra de la UI: en
 * un vaquitatag no es un carácter legal (`NICKNAME_FORMAT_REGEX`), así que
 * mandarlo tal cual da 404.
 */
export function nicknameSegment(input: string): string {
  return sanitizeNickname(input.trim().replace(/^@+/, ''));
}
