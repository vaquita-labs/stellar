'use client';

import { Button } from '@/core-ui/components/atoms';
import { usePollar } from '@pollar/react';

interface PollarLoginButtonProps {
  className?: string;
}

export function PollarLoginButton({ className }: PollarLoginButtonProps) {
  const { openLoginModal } = usePollar();

  return (
    <Button
      onPress={() => openLoginModal()}
      className={
        className ??
        'px-5 py-2 rounded-md w-full bg-white border border-black border-b-3 text-black text-sm font-semibold hover:bg-gray-50 transition shadow-sm'
      }
    >
      Sign in
    </Button>
  );
}
