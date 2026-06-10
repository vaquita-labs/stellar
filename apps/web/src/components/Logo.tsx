'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export function Logo() {
  const { t } = useTranslation();
  return (
    <Link href="/" className="block">
      {/* Mobile & Tablet */}
      <div className="md:hidden">
        <Image src="/assets/logo/logo-mobile.png" alt={t('shell.logo.alt', 'Vaquiland Logo')} width={120} height={32} priority />
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <Image src="/assets/logo/logo-desktop.png" alt={t('shell.logo.alt', 'Vaquiland Logo')} width={200} height={100} priority />
      </div>
    </Link>
  );
}
