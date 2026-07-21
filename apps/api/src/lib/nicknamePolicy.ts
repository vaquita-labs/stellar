// Nickname policy: charset, reserved names, and moderation. Nicknames are
// user-visible all over the app (leaderboard, follows, share cards) AND double
// as a public URL segment, so offensive, impersonating or route-colliding names
// are rejected at the API — client-side checks alone can be bypassed with a
// direct request.
//
// The term lists live in blockedNicknameTerms.json (categorized by language and
// severity for maintenance; flattened here at load). Two matching modes, because
// pure substring matching over-blocks real names (the "Scunthorpe problem":
// "sex" is inside "essex", "anal" inside "analia", "fag" inside "fagundes"):
//
// - `substrings`: terms that almost never appear inside an innocent nickname.
//   Matched anywhere, with separators/leetspeak collapsed, so "p-o-r-n-o",
//   "p0rno" and "xxpornoxx" are all caught.
// - `words`: terms that DO appear inside innocent names, so they only match as
//   a whole token ("puta" blocks "puta" and "puta123" but not "computadora")
//   or as the entire collapsed nickname ("p.u.t.a").
//
// Entries must be lowercase ASCII with no accents or spaces — input is
// lowercased/accent-stripped/collapsed before matching, so an entry that
// carries an accent or a space can never match; the load-time check below
// rejects those instead of letting them silently do nothing.

import blockedTerms from './blockedNicknameTerms.json';

// Nicknames double as the public profile URL segment (/leaderboard/<nickname>),
// so the charset is restricted to URL-safe lowercase: letters, digits and
// underscore, 3-32 chars. No spaces, no accents, no symbols.
export const NICKNAME_FORMAT_REGEX = /^[a-z0-9_]{3,32}$/;

/** True when the (already lowercased/trimmed) nickname is URL-safe. */
export function isNicknameFormatValid(nickname: string): boolean {
  return NICKNAME_FORMAT_REGEX.test(nickname);
}

// Names that would collide with a route if they became a URL segment. Today only
// /explore/<nickname> is user-namespaced and /explore has no static siblings, so
// nothing is actually shadowed — this is insurance. The day someone adds
// /explore/search (or a top-level /<nickname>), a user already holding that name
// becomes unreachable and has to be renamed by hand; rejecting up front is free.
//
// Matched EXACTLY, not as a substring: "admin1" shadows no route, so this list
// leaves it alone. Entries shorter than 3 chars would be dead (the format regex
// already rejects them), so "me", "og" and friends are deliberately absent.
//
// This list is about ROUTES only. Names that impersonate the app or its team
// ("admin", "support", "vaquita", …) live in blockedNicknameTerms.json under
// `reserved_impersonation`, where token matching also catches "admin_1" — don't
// duplicate them here.
const RESERVED_NICKNAMES = new Set([
  // Current top-level routes
  'explore', 'home', 'leaderboard', 'login', 'notifications', 'onboarding',
  'profile', 'shop', 'transactions', 'tutorial', 'api', 'share',
  // Routes an app like this grows into
  'about', 'account', 'accounts', 'auth', 'billing', 'blog', 'contact',
  'dashboard', 'docs', 'edit', 'faq', 'feed', 'help', 'legal', 'logout', 'new',
  'privacy', 'search', 'security', 'settings', 'signin', 'signup', 'terms',
  'user', 'users', 'wallet',
  // Reserved by the framework or prone to breaking clients
  'assets', 'favicon', 'manifest', 'next', 'null', 'public', 'robots',
  'sitemap', 'static', 'undefined', 'www',
]);

/** True when the nickname would collide with a current or likely future route. */
export function isNicknameReserved(nickname: string): boolean {
  return RESERVED_NICKNAMES.has(nickname);
}

// A term with uppercase, accents, spaces or symbols can never match the
// collapsed input — fail loudly at module load instead of shipping a dead entry.
const assertMatchable = (terms: string[], source: string): string[] => {
  for (const term of terms) {
    if (!/^[a-z0-9]+$/.test(term)) {
      throw new Error(
        `blockedNicknameTerms.json: entry "${term}" in "${source}" is not matchable — use lowercase ASCII letters/digits only (no accents, spaces or symbols).`,
      );
    }
  }
  return terms;
};

const BLOCKED_SUBSTRINGS = assertMatchable(
  Object.values(blockedTerms.substrings).flat(),
  'substrings',
);
const BLOCKED_WORDS = assertMatchable(Object.values(blockedTerms.words).flat(), 'words');

// Common obfuscations mapped back to letters BEFORE matching, so "p0rn0",
// "s3xo" or "put@" don't slip through.
const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i', '+': 't',
};

const stripAccents = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const deleet = (value: string) => value.replace(/[0134578@$!+]/g, (ch) => LEET_MAP[ch] ?? ch);

const WORD_SET = new Set(BLOCKED_WORDS);

/** True when the (already lowercased) nickname is acceptable to store. */
export function isNicknameAllowed(nickname: string): boolean {
  if (isNicknameReserved(nickname)) return false;

  const normalized = stripAccents(nickname.toLowerCase());

  // Separator-collapsed variants: plain and with leetspeak undone.
  const collapsed = normalized.replace(/[^a-z0-9]+/g, '');
  // deleet BEFORE collapsing: "put@" must become "puta", not lose the "@".
  const collapsedDeleet = deleet(normalized).replace(/[^a-z]+/g, '');

  for (const term of BLOCKED_SUBSTRINGS) {
    if (collapsed.includes(term) || collapsedDeleet.includes(term)) return false;
  }

  // Word terms: match whole tokens (split on anything non-alphabetic, so
  // "puta123" and "puta_x" both yield the token "puta") or the entire
  // collapsed nickname (catches "p.u.t.a").
  const tokens = normalized.split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((token) => WORD_SET.has(token))) return false;
  if (WORD_SET.has(collapsed) || WORD_SET.has(collapsedDeleet)) return false;

  return true;
}
