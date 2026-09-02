// Nickname rules, mirrored from the API (apps/api/src/lib/nicknamePolicy.ts).
// Nicknames double as the public profile URL segment (/leaderboard/<nickname>
// and /explore/<nickname>), so the charset is restricted to URL-safe lowercase:
// letters, digits and underscore. No '@', no spaces, no accents, no emoji.
//
// This is UX only — the API re-validates every write, so a crafted request
// still gets rejected there.

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 32;
export const NICKNAME_FORMAT_REGEX = /^[a-z0-9_]{3,32}$/;

/**
 * Strips anything a nickname may not contain, so typing "@Juan Pérez!" leaves
 * "juanperez". Meant for an input's onChange: the field can never hold a value
 * the API would reject on charset grounds.
 *
 * Accents are folded to their base letter (NFKD + drop combining marks) rather
 * than dropped, so "Pérez" becomes "perez" and not "prez".
 */
export function sanitizeNickname(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, NICKNAME_MAX_LENGTH);
}

export function isNicknameFormatValid(nickname: string): boolean {
  return NICKNAME_FORMAT_REGEX.test(nickname);
}

/**
 * Lleva lo que el usuario escribió al segmento que la API espera en
 * `/profile/nickname/:nickname`. El `@` es una convención nuestra de la UI: en
 * un nickname no es un carácter legal (`NICKNAME_FORMAT_REGEX`), así que
 * mandarlo tal cual da 404.
 */
export function nicknameSegment(input: string): string {
  return sanitizeNickname(input.trim().replace(/^@+/, ''));
}
