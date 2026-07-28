import dotenv from 'dotenv';

// .env.local takes precedence over .env, matching the Next.js apps. Imported
// FIRST by the entrypoint so process.env is populated before the @vaquita/shared
// config modules are evaluated (their zod schemas validate at import).
dotenv.config({ path: ['.env.local', '.env'] });
