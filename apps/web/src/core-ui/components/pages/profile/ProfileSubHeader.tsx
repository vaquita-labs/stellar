'use client';

import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

interface ProfileSubHeaderProps {
  title: string;
  backHref?: string;
}

export function ProfileSubHeader({ title, backHref = '/profile' }: ProfileSubHeaderProps) {
  return (
    <div className="relative flex items-center justify-center min-h-10 px-10">
      <Link
        href={backHref}
        aria-label="Back"
        className="absolute left-0 flex h-10 w-10 items-center justify-center"
      >
        <Image src="/icons/arrow-back.svg" alt="back" width={28} height={28} />
      </Link>
      <div className="text-center min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-black truncate">{title}</h1>
      </div>
    </div>
  );
}
