'use client';

import { Button, toast } from '@heroui/react';
import { Canvas } from '@react-three/fiber';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile, useProfileMapObjectsAvailable, useProfileRewards, usePurchaseMapItem } from '../../../hooks';
import { EditionMode, useMapStore } from '../../../stores';
import { MapObjectType } from '../../../types';
import { SceneLighting } from '../../map/scene/SceneLighting';
import { AppModal } from '../../molecules/AppModal';
import { CarouselScroller } from './CarouselScroller';
import { CatalogObjectCard } from './CatalogObjectCard';
import { isHudItem } from './hudItems';
import { getMapItemName } from './mapItemNames';

interface CatalogItem {
  type: MapObjectType;
  variant: number;
  price: number;
  itemsAvailable: number;
}

/**
 * Catálogo de la tienda: los ítems comprables vienen del backend (map_objects
 * con price > 0). Comprar descuenta monedas del ledger y suma el ítem al
 * inventario; después se ofrece colocarlo en el mapa de inmediato o dejarlo
 * en la colección.
 */
export function CatalogList() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { data: available } = useProfileMapObjectsAvailable();
  const { data: profileRewards } = useProfileRewards();
  const purchase = usePurchaseMapItem();
  const currentTiles = useMapStore((store) => store.currentTiles);
  const setPickedItem = useMapStore((store) => store.setPickedItem);
  const setEditMode = useMapStore((store) => store.setEditMode);

  const [detailItem, setDetailItem] = useState<CatalogItem | null>(null);
  // Tras comprar: ofrecer colocar ya mismo o guardar en la colección.
  const [placementItem, setPlacementItem] = useState<CatalogItem | null>(null);

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;

  const items: CatalogItem[] = useMemo(
    () =>
      (available?.objects || []).filter(
        // Los ítems de HUD (el reloj) son un desbloqueo de una sola vez: una vez
        // comprados salen del catálogo, no se acumulan unidades.
        (object) => object.price > 0 && !(isHudItem(object.type) && object.owned > 0)
      ),
    [available?.objects]
  );

  const closeDetail = () => setDetailItem(null);

  const handleBuy = async () => {
    if (!detailItem || purchase.isPending) return;
    try {
      const result = await purchase.mutateAsync({ type: detailItem.type, variant: detailItem.variant });
      toast.success(t('home.catalog.purchaseSuccessTitle', 'Purchase successful!'), {
        description: t('home.catalog.purchaseSuccessDesc', "You've successfully purchased {{name}}", {
          name: getMapItemName(t, detailItem.type, detailItem.variant),
        }),
        timeout: 4000,
      });
      // Un ítem de HUD no se coloca: alcanza con la compra, así que se saltea
      // el paso de "colocar ahora" (el reloj ya aparece sobre el mapa).
      if (!isHudItem(detailItem.type)) {
        // itemsAvailable local todavía no refleja el refetch: sumar la unidad comprada.
        setPlacementItem({ ...detailItem, itemsAvailable: detailItem.itemsAvailable + result.quantity });
      }
      setDetailItem(null);
    } catch (error) {
      toast.danger(t('home.catalog.purchaseErrorTitle', 'Purchase failed'), {
        description: error instanceof Error ? error.message : t('home.catalog.purchaseErrorDesc', 'Try again.'),
        timeout: 4000,
      });
    }
  };

  const handlePlaceNow = () => {
    if (!placementItem) return;
    const used = currentTiles.reduce(
      (sum, tile) => sum + +(tile.type === placementItem.type && tile.variant === placementItem.variant),
      0
    );
    // Mismo flujo que elegir el ítem desde la colección: queda "picado" y el
    // mapa entra en modo ADD (el panel se minimiza solo para dejar colocar).
    setPickedItem({
      type: placementItem.type,
      variant: placementItem.variant,
      used,
      itemsAvailable: placementItem.itemsAvailable,
    });
    setEditMode(EditionMode.ADD);
    setPlacementItem(null);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
        <Image src="/icons/summary/bag.png" alt="" width={48} height={48} className="opacity-60" />
        <p className="text-sm text-gray-600">{t('home.catalog.empty', 'The catalog is empty right now.')}</p>
        <p className="text-xs text-gray-500">{t('home.catalog.emptyHint', 'Come back soon for new items!')}</p>
      </div>
    );
  }

  // Misma matemática de layout que ObjectList: N cards de `spacing` unidades
  // de mundo, cámara ortográfica con `zoom` px por unidad.
  const zoom = isMobile ? 50 : 60;
  const spacing = 2.5;
  const startX = -((items.length - 1) * spacing) / 2;
  const canvasWidth = items.length * spacing * zoom;

  const detailAffordable = detailItem ? goldCoins >= detailItem.price : false;

  return (
    <>
      <CarouselScroller className="h-[180px] sm:h-[200px] w-full">
        <div style={{ width: canvasWidth, height: '100%' }}>
          <Canvas shadows orthographic camera={{ position: [0, 10, 10], zoom, near: 0.1, far: 1000 }}>
            <SceneLighting />
            <group>
              {items.map((item, index) => (
                <CatalogObjectCard
                  key={`${item.type}-${item.variant}`}
                  type={item.type}
                  variant={item.variant}
                  price={item.price}
                  affordable={goldCoins >= item.price}
                  position={[startX + index * spacing, 0, 0]}
                  onClick={() => setDetailItem(item)}
                />
              ))}
            </group>
          </Canvas>
        </div>
      </CarouselScroller>

      {/* Detalle + compra */}
      <AppModal
        open={!!detailItem}
        onOpenChange={closeDetail}
        title={detailItem ? getMapItemName(t, detailItem.type, detailItem.variant) : ''}
        footer={
          <Button
            className={`w-full ${
              detailAffordable
                ? 'bg-primary border border-black border-b-2 text-black font-semibold hover:bg-[#e68a00]'
                : 'bg-gray-200 border border-gray-400 text-gray-500 cursor-not-allowed'
            } rounded-md`}
            onPress={handleBuy}
            isDisabled={!detailAffordable || purchase.isPending}
          >
            {purchase.isPending
              ? t('home.catalog.processing', 'Processing...')
              : detailAffordable
                ? t('home.catalog.buy', 'Buy')
                : t('home.catalog.notEnoughCoinsTitle', 'Not enough coins')}
          </Button>
        }
      >
        {detailItem && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {isHudItem(detailItem.type)
                ? t('home.catalog.hudHint', 'Buying it unlocks it on your map screen. It is a one-time purchase.')
                : t('home.catalog.placeableHint', 'After buying you can place it anywhere on your map, move it or remove it.')}
            </p>
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">{t('home.catalog.price', 'Price')}</p>
              <div className="flex items-center gap-1">
                <Image src="/icons/global/coin.png" alt={t('home.catalog.goldAlt', 'Gold')} width={24} height={24} className="object-contain" />
                <span className="text-lg font-bold text-black">{detailItem.price}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {t('home.catalog.youHave', 'You have {{count}}', { count: goldCoins })}
              </p>
            </div>
          </div>
        )}
      </AppModal>

      {/* Post-compra: colocar ahora o dejar en la colección */}
      <AppModal
        open={!!placementItem}
        onOpenChange={() => setPlacementItem(null)}
        title={t('home.catalog.placeNowTitle', 'Place it now?')}
        footer={
          <div className="flex gap-2 w-full [&>*]:flex-1">
            <Button
              className="bg-white border border-black border-b-2 text-black font-semibold hover:bg-gray-100 rounded-md"
              onPress={() => setPlacementItem(null)}
            >
              {t('home.catalog.keepForLater', 'Keep in collection')}
            </Button>
            <Button
              className="bg-primary border border-black border-b-2 text-black font-semibold hover:bg-[#e68a00] rounded-md"
              onPress={handlePlaceNow}
            >
              {t('home.catalog.placeNow', 'Place now')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-700">
          {placementItem &&
            t('home.catalog.placeNowDesc', '{{name}} is now in your collection. You can place it on your map right away.', {
              name: getMapItemName(t, placementItem.type, placementItem.variant),
            })}
        </p>
      </AppModal>
    </>
  );
}
