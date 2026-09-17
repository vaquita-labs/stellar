/**
 * The only place in the code that reads `process.env.NEXT_PUBLIC_BUILD_STAMP`.
 *
 * Deliberately not in clientEnv.ts: this is not an environment variable, it is a
 * constant next.config.ts injects through `env` (the reasoning lives there).
 * Keeping it in its own tiny module also keeps the per-build byte change out of
 * the widely imported `clientEnv` chunk.
 *
 * Both the client component and the `/api/version` route handler import THIS, so
 * the two sides come from the same text. If Next ever stopped inlining it they
 * would both fall to '' and the check would switch itself off — instead of one
 * side holding a value and the other not, which would be the banner stuck on
 * forever.
 *
 * The substitution is textual: never destructure this from `process.env` and
 * never read it as `process.env[key]`, or it stays undefined at runtime.
 */
export const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP ?? '';
