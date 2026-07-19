// Nickname moderation. Nicknames are user-visible all over the app (leaderboard,
// follows, share cards), so offensive or impersonating names are rejected at the
// API — client-side checks alone can be bypassed with a direct request.
//
// Two matching modes, because pure substring matching over-blocks real names
// (the "Scunthorpe problem": "sex" is inside "essex", "anal" inside "analia"):
//
// - BLOCKED_SUBSTRINGS: terms that almost never appear inside an innocent
//   nickname. Matched anywhere, with separators/leetspeak collapsed, so
//   "p-o-r-n-o", "p0rno" and "xxpornoxx" are all caught.
// - BLOCKED_WORDS: terms that DO appear inside innocent names, so they only
//   match as a whole token ("puta" blocks "puta" and "puta123" but not
//   "computadora") or as the entire collapsed nickname ("p.u.t.a").
//
// Both lists are plain lowercase ASCII; input is lowercased and accent-stripped
// before matching, so "pör̃no" and "PUTA" are covered. Extend the lists freely —
// entries must be lowercase, unaccented.

// Nicknames double as the public profile URL segment (/leaderboard/<nickname>),
// so the charset is restricted to URL-safe lowercase: letters, digits and
// underscore, 3-32 chars. No spaces, no accents, no symbols.
export const NICKNAME_FORMAT_REGEX = /^[a-z0-9_]{3,32}$/;

/** True when the (already lowercased/trimmed) nickname is URL-safe. */
export function isNicknameFormatValid(nickname: string): boolean {
  return NICKNAME_FORMAT_REGEX.test(nickname);
}

const BLOCKED_SUBSTRINGS = [
  // sexual / porn
  'porn', 'xxx', 'hentai', 'blowjob', 'dildo', 'onlyfans',
  'chupapija', 'chupaverga', 'garchar', 'garchando',
  // slurs / hate
  'nigg', 'faggot', 'nazi', 'hitler',
  // abuse
  'pedofil', 'pedoph', 'violador', 'violadora',
  'fuck',
];

const BLOCKED_WORDS = [
  // en
  'sex', 'anal', 'dick', 'cock', 'pussy', 'cum', 'tits', 'boobs',
  'whore', 'slut', 'bitch', 'cunt', 'rape', 'shit',
  // es
  'porno', 'sexo', 'puta', 'puto', 'putita', 'putito', 'mierda', 'verga',
  'pija', 'poronga', 'pene', 'concha', 'culo', 'tetas', 'pajero', 'pajera',
  'trolo', 'trola', 'sorete', 'pelotudo', 'pelotuda', 'boludo', 'boluda',
  // pt
  'caralho', 'buceta', 'porra', 'foda', 'foder', 'merda', 'viado', 'piroca',
  // reserved / impersonation
  'admin', 'administrator', 'administrador', 'moderator', 'moderador', 'mod',
  'support', 'soporte', 'suporte', 'official', 'oficial', 'staff', 'root',
  'system', 'vaquita',
];

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
