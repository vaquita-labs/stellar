import dotenv from 'dotenv';

// .env.local takes precedence over .env, matching the Next.js apps.
dotenv.config({ path: ['.env.local', '.env'] });
