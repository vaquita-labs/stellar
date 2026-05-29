'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import posthog from 'posthog-js';

export const initPosthog = () => {
  if (typeof window !== 'undefined') {
    posthog.init(clientEnv.NEXT_PUBLIC_POSTHOG_KEY ?? '', {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // 'https://app.posthog.com', // o tu instancia self-hosted
      autocapture: true,
    });
  }
  return posthog;
};
