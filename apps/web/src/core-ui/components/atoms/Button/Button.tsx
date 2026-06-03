'use client';

// The button lives in the shared @vaquita/ui package so web and admin render the
// exact same component. Re-exported here to keep existing `@/core-ui` imports working.
export { Button } from '@vaquita/ui';
export type { ButtonProps, ButtonVariant } from '@vaquita/ui';
