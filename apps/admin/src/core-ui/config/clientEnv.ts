import { z } from 'zod';

const envClientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  NEXT_PUBLIC_SERVICES_URL: z.url(),
  // Public base URL of the user-facing app, used to build shareable campaign
  // links. Optional: the campaigns page falls back to a hardcoded production
  // URL, and getting the link's host wrong is a copy/paste annoyance, not a
  // reason to refuse to boot the whole admin panel.
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

const parsed = envClientSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SERVICES_URL: process.env.NEXT_PUBLIC_SERVICES_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.format());
  throw new Error('Invalid environment variables');
}

export const clientEnv = parsed.data;
