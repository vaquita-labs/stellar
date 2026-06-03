'use client';

import { Button, Modal, toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useState } from 'react';
import { useProfileRewards } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { ShopItem } from '../../organisms/ShopModal/types';

const catalogItems: ShopItem[] = [
  {
    id: 'tree',
    name: 'Tree',
    description: 'A beautiful tree to decorate your map. Always available!',
    price: { goldCoins: 1 },
    image: '/icons/summary/streak_freeze.png',
    alwaysAvailable: true,
    biome: 'forest',
    type: 'decoration',
    rarity: 'common',
  },
  {
    id: 'streak-freeze',
    name: 'Streak Freeze',
    description: 'Protect your streak for one day if you cannot maintain it',
    price: { goldCoins: 1 },
    image: '/icons/summary/streak_freeze.png',
    biome: 'any',
    type: 'utility',
    rarity: 'common',
  },
  {
    id: 'tile-pack',
    name: 'Tile Pack',
    description: 'Pack of 5 exclusive tiles for your map',
    price: { goldCoins: 3 },
    image: '/icons/summary/edit_map.png',
    biome: 'plains',
    type: 'expansion',
    rarity: 'rare',
  },
  {
    id: 'fountain',
    name: 'Decorative Fountain',
    description: 'A stunning fountain to enhance your map',
    price: { goldCoins: 2 },
    image: '/icons/summary/edit_map.png',
    biome: 'desert',
    type: 'decoration',
    rarity: 'rare',
  },
  {
    id: 'golden-statue',
    name: 'Golden Statue',
    description: 'A prestigious golden statue for your collection',
    price: { goldCoins: 15 },
    image: '/icons/global/coin.png',
    biome: 'mountain',
    type: 'decoration',
    rarity: 'legendary',
  },
];

const rarityBadge: Record<NonNullable<ShopItem['rarity']>, string> = {
  common: 'bg-gray-100 text-gray-700 border-gray-300',
  rare: 'bg-blue-100 text-blue-700 border-blue-300',
  epic: 'bg-purple-100 text-purple-700 border-purple-300',
  legendary: 'bg-amber-100 text-amber-800 border-amber-400',
};

export function CatalogList() {
  const { data: profileRewards, refetch } = useProfileRewards();
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();

  const [detailItem, setDetailItem] = useState<ShopItem | null>(null);
  const [offerMode, setOfferMode] = useState(false);
  const [offerGold, setOfferGold] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isOffering, setIsOffering] = useState(false);

  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;

  const canAfford = (item: ShopItem): boolean => {
    if (item.alwaysAvailable) return true;
    return goldCoins >= item.price.goldCoins;
  };

  const closeDetail = () => {
    setDetailItem(null);
    setOfferMode(false);
    setOfferGold('');
  };

  const handleBuy = async () => {
    if (!detailItem || isPurchasing) return;
    setIsPurchasing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await queryClient.invalidateQueries({
        queryKey: ['profile', network?.networkName, walletAddress, 'profile-rewards'],
      });
      await refetch();
      toast.success('Purchase successful!', {
        description: `You've successfully purchased ${detailItem.name}`,
        timeout: 4000,
      });
      closeDetail();
    } catch (error) {
      console.error('Purchase error:', error);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleMakeOffer = async () => {
    if (!detailItem || isOffering) return;
    const gold = Number(offerGold) || 0;
    if (gold <= 0) {
      toast.danger('Invalid offer', { description: 'Enter at least 1 gold coin.', timeout: 3000 });
      return;
    }
    if (gold > goldCoins) {
      toast.danger('Not enough coins', { description: 'Your offer exceeds your balance.', timeout: 3000 });
      return;
    }
    setIsOffering(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      toast.success('Offer submitted!', {
        description: `Offered ${gold} gold for ${detailItem.name}`,
        timeout: 4000,
      });
      closeDetail();
    } catch (error) {
      console.error('Offer error:', error);
    } finally {
      setIsOffering(false);
    }
  };

  const detailAffordable = detailItem ? canAfford(detailItem) : false;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {catalogItems.map((item) => {
          const affordable = canAfford(item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setDetailItem(item)}
              className={`shrink-0 w-28 sm:w-32 text-left bg-white border border-black/10 border-b-2 rounded-lg p-2 flex flex-col gap-2 hover:-translate-y-0.5 transition ${
                !affordable && !item.alwaysAvailable ? 'opacity-70' : ''
              }`}
            >
              <div className="relative w-full aspect-square bg-[#FFF7E6] rounded-md flex items-center justify-center overflow-hidden">
                {item.rarity && (
                  <span
                    className={`absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wide border rounded-sm px-1 py-0.5 ${rarityBadge[item.rarity]}`}
                  >
                    {item.rarity}
                  </span>
                )}
                {item.image && (
                  <Image src={item.image} alt={item.name} width={64} height={64} className="object-contain" />
                )}
              </div>
              <span className="text-xs font-bold text-black truncate">{item.name}</span>
              <div className="flex items-center gap-2 mt-auto">
                <div className="flex items-center gap-1">
                  <Image src="/icons/global/coin.png" alt="Gold" width={14} height={14} className="object-contain" />
                  <span className="text-xs font-bold text-black">{item.price.goldCoins}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Modal.Backdrop isOpen={!!detailItem} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <Modal.Container size="md">
          <Modal.Dialog className="bg-background border border-black">
            <Modal.CloseTrigger>
              <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className="text-black font-bold text-lg">{detailItem?.name ?? 'Item'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {detailItem && (
                <div className="space-y-4">
                  <div className="w-full aspect-square max-h-56 bg-[#FFF7E6] border border-black/10 rounded-md flex items-center justify-center overflow-hidden">
                    {detailItem.image && (
                      <Image src={detailItem.image} alt={detailItem.name} width={160} height={160} className="object-contain" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {detailItem.rarity && (
                      <span className={`text-[11px] font-bold uppercase border rounded-sm px-2 py-0.5 ${rarityBadge[detailItem.rarity]}`}>
                        {detailItem.rarity}
                      </span>
                    )}
                    {detailItem.type && (
                      <span className="text-[11px] font-semibold uppercase bg-[#DDF4FF] text-black border border-[#84D8FF] rounded-sm px-2 py-0.5">
                        {detailItem.type}
                      </span>
                    )}
                    {detailItem.biome && (
                      <span className="text-[11px] font-semibold uppercase bg-[#FFF7E6] text-black border border-[#B97204]/40 rounded-sm px-2 py-0.5">
                        {detailItem.biome}
                      </span>
                    )}
                    {detailItem.alwaysAvailable && (
                      <span className="text-[11px] font-bold uppercase bg-green-100 text-green-800 border border-green-300 rounded-sm px-2 py-0.5">
                        Always
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700">{detailItem.description}</p>

                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Price</p>
                    <div className="flex items-center gap-1">
                      <Image src="/icons/global/coin.png" alt="Gold" width={24} height={24} className="object-contain" />
                      <span className="text-lg font-bold text-black">{detailItem.price.goldCoins}</span>
                    </div>
                  </div>

                  {offerMode && (
                    <div className="pt-2 border-t border-gray-200 space-y-3">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Your offer</p>
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2 bg-white border border-black rounded-md px-2 py-1.5">
                          <Image src="/icons/global/coin.png" alt="Gold" width={20} height={20} className="object-contain shrink-0" />
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={offerGold}
                            onChange={(e) => setOfferGold(e.target.value.replace(/[^\d]/g, ''))}
                            placeholder="0"
                            className="flex-1 min-w-0 w-full bg-transparent text-sm text-black outline-none"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 px-1">You have {goldCoins}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              {offerMode ? (
                <>
                  <Button
                    className="bg-gray-200 border border-gray-400 text-gray-700 font-semibold rounded-md hover:bg-gray-300"
                    onPress={() => {
                      setOfferMode(false);
                      setOfferGold('');
                    }}
                    isDisabled={isOffering}
                  >
                    Back
                  </Button>
                  <Button
                    className="bg-primary border border-black border-b-2 text-black font-semibold hover:bg-[#e68a00] rounded-md"
                    onPress={handleMakeOffer}
                    isDisabled={isOffering}
                  >
                    {isOffering ? 'Sending...' : 'Submit offer'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="bg-white border border-black border-b-2 text-black font-semibold hover:bg-gray-100 rounded-md"
                    onPress={() => setOfferMode(true)}
                    isDisabled={isPurchasing}
                  >
                    Make offer
                  </Button>
                  <Button
                    className={`${
                      detailAffordable || detailItem?.alwaysAvailable
                        ? 'bg-primary border border-black border-b-2 text-black font-semibold hover:bg-[#e68a00]'
                        : 'bg-gray-200 border border-gray-400 text-gray-500 cursor-not-allowed'
                    } rounded-md`}
                    onPress={handleBuy}
                    isDisabled={(!detailAffordable && !detailItem?.alwaysAvailable) || isPurchasing}
                  >
                    {isPurchasing ? 'Processing...' : 'Buy'}
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
