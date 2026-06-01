'use client';

import { Popover } from '@heroui/react';
import Image from 'next/image';
import { ReactNode } from 'react';

type StatItemProps = {
  icon: string;
  label: string;
  value: number | string;
  description: ReactNode;
};

export const StatItem = ({ icon, label, value, description }: StatItemProps) => {
  return (
    <Popover>
      <Popover.Trigger>
        <div className="flex items-center justify-center text-black gap-0 m-4">
          <Image src={icon} alt={label} width={32} height={32} />
          <span className="text-xl font-bold drop-shadow-xs">{value}</span>
        </div>
      </Popover.Trigger>
      <Popover.Content placement="bottom">
        <Popover.Dialog className="bg-background rounded-md border border-black px-1 py-2">
          <div className="text-small font-bold">{label}</div>
          <div className="text-tiny">{description}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
};
