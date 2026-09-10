/**
 * Where `/login?redirect=…` is allowed to send someone once they are in.
 *
 * The value comes off the query string, so whoever writes the link chooses it.
 * A link that signs you into a money app and drops you on somebody else's
 * domain is a phishing primitive, so anything that leaves this origin is
 * refused and the caller falls back to the home.
 *
 * Resolved with `URL` against the current origin rather than checked by hand.
 * A leading-slash test looks like it covers this and does not: `//evil.com` is a
 * protocol-relative URL, it starts with `/`, and the router follows it straight
 * off the site — verified against a running app, which is what this exists for.
 * `/\evil.com` is the same trick with the slash browsers also accept. Asking
 * `URL` for the origin settles every one of those spellings at once.
 *
 * The path is rebuilt from the parsed URL, so what comes back is normalised and
 * always relative: no scheme, no host, and the query and hash kept — the query
 * is the point, since it carries `?tx=` and the like through the auth gate.
 */
export function internalRedirect(raw: string | null | undefined, origin: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null; // Not a URL at all: nothing to honour.
  }
  if (url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
