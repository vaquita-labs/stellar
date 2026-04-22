'use client';
import { Button, ButtonProps } from '@heroui/react';

interface ConnectButtonProps {
  onPress: ButtonProps['onPress'];
  startContentSrc: string;
  startContentAlt: string;
}

export function ConnectButton({ onPress }: ConnectButtonProps) {
  return (
    <Button
      onPress={onPress}
      // startContent={<Image src={startContentSrc} alt={startContclearentAlt} width={24} height={24} className="rounded-sm" />}
      className="px-5 m-2 rounded-md w-full bg-primary border border-black border-b-3 text-black text-sm font-semibold hover:bg-primary/80 transition shadow-sm"
    >
      Connect Wallet
    </Button>
  );
}
