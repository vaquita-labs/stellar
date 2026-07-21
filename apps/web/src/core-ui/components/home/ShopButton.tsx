'use client';

import { Button } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalPresence } from '../molecules/AppModal';
import { ShopModal } from '../organisms';

export const ShopButton = () => {
  const { t } = useTranslation();
  const [showShopModal, setShowShopModal] = useState(false);
  const shopModalMounted = useModalPresence(showShopModal);

  return (
    <>
      <Button
        onPress={() => setShowShopModal(true)}
        className="bg-transparent rounded-lg gap-1 min-w-0 shrink"
      >
        <Image
          src="/icons/summary/shop.png"
          alt={t('home.shop.title', 'Shop')}
          width={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
          height={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
          className="object-contain"
          priority
        />
        <span className="text-xs font-semibold text-black">{t('home.shop.title', 'Shop')}</span>
      </Button>
      {shopModalMounted && <ShopModal open={showShopModal} onOpenChange={() => setShowShopModal(false)} />}
    </>
  );
};
