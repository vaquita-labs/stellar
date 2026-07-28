import dotenv from 'dotenv';

// .env.local takes precedence over .env, matching the Next.js apps. Imported
// FIRST by the entrypoint so process.env is populated before @vaquita/db is
// evaluated (it builds the Prisma adapter from DATABASE_URL at import time).
dotenv.config({ path: ['.env.local', '.env'] });
