'use client';

import { Button, Card, Modal, toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useState } from 'react';
import { useProfileRewards } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { ShopItem, ShopModalProps } from './types';

// Shop items data — single-currency (gold). Prices were rebalanced from the
// previous silver+gold dual economy using a 100 silver = 1 gold ratio
// (rounded up, minimum 1) so the relative cost of each item is preserved.
const shopItems: ShopItem[] = [
  {
    id: '1',
    name: 'Tree',
    description: 'A beautiful tree to decorate your map. Always available!',
    price: {
      goldCoins: 1,
    },
    image: '/icons/summary/streak_freeze.png',
    alwaysAvailable: true,
  },
  {
    id: '2',
    name: 'Streak Freeze',
    description: 'Protect your streak for one day if you cannot maintain it',
    price: {
      goldCoins: 1,
    },
    image: '/icons/summary/streak_freeze.png',
  },
  {
    id: '3',
    name: 'Streak Repair',
    description: 'Restore your streak up to 7 days',
    price: {
      goldCoins: 2,
    },
    image: '/icons/global/streak.png',
  },
  {
    id: '4',
    name: 'Tile Pack',
    description: 'Pack of 5 exclusive tiles for your map',
    price: {
      goldCoins: 3,
    },
  },
  {
    id: '5',
    name: 'Premium Theme',
    description: 'Premium theme to customize your experience',
    price: {
      goldCoins: 5,
    },
  },
  {
    id: '6',
    name: 'Energy Boost',
    description: 'Double your daily rewards for 24 hours',
    price: {
      goldCoins: 2,
    },
  },
  {
    id: '7',
    name: 'Lucky Charm',
    description: 'Increases your chance of getting rare rewards',
    price: {
      goldCoins: 2,
    },
  },
  {
    id: '8',
    name: 'Map Expansion',
    description: 'Unlock additional space for your map',
    price: {
      goldCoins: 10,
    },
  },
  {
    id: '9',
    name: 'Decorative Fountain',
    description: 'A stunning fountain to enhance your map',
    price: {
      goldCoins: 2,
    },
  },
  {
    id: '10',
    name: 'Golden Statue',
    description: 'A prestigious golden statue for your collection',
    price: {
      goldCoins: 15,
    },
  },
];

export function ShopModal({ open, onOpenChange }: ShopModalProps) {
  const { data: profileRewards, refetch } = useProfileRewards();
  const queryClient = useQueryClient();
  const { network, walletAddress } = useNetworkConfigStore();
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const goldCoins = profileRewards?.rewards?.find((reward) => reward?.name === 'Gold Coin')?.amount ?? 0;

  const canAfford = (item: ShopItem): boolean => {
    if (item.alwaysAvailable) return true;
    return goldCoins >= item.price.goldCoins;
  };

  const handlePurchaseClick = (item: ShopItem) => {
    setSelectedItem(item);
    setConfirmModalOpen(true);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedItem || isPurchasing) return;

    setIsPurchasing(true);

    try {
      // Mock purchase - in a real app, this would call an API
      // For now, we'll simulate a delay and then invalidate the query
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Invalidate and refetch the rewards query to update coins
      await queryClient.invalidateQueries({
        queryKey: ['profile', network?.name, walletAddress, 'profile-rewards'],
      });
      await refetch();

      toast.success('Purchase successful!', { description: `You've successfully purchased ${selectedItem.name}`, timeout: 4000 });

      setConfirmModalOpen(false);
      setSelectedItem(null);
    } catch (error) {
      console.error('Purchase error:', error);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleCancelPurchase = () => {
    setConfirmModalOpen(false);
    setSelectedItem(null);
  };

  const isAffordable = selectedItem ? canAfford(selectedItem) : false;

  return (
    <>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => { if (!o) onOpenChange(); }}>
        <Modal.Container size="lg" scroll="inside">
          <Modal.Dialog className="bg-background border border-black max-h-[90vh] flex flex-col">
            <Modal.CloseTrigger>
              <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
            </Modal.CloseTrigger>
          <Modal.Header className="shrink-0">
            <Modal.Heading className="text-black font-bold text-xl">
            <div className="flex items-center justify-start w-full gap-4">
              <div className="flex items-center gap-2">
                <Image src="/icons/summary/shop.png" alt="shop" width={24} height={24} />
                <span>Shop</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Image
                    src="/icons/global/coin.png"
                    alt="Gold Coin"
                    width={24}
                    height={24}
                    className="object-contain"
                  />
                  <span className="text-sm font-semibold text-black">{goldCoins}</span>
                </div>
              </div>
            </div>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-4">
              {shopItems.map((item) => {
                const affordable = canAfford(item);
                const isDisabled = !affordable && !item.alwaysAvailable;

                return (
                  <Card
                    key={item.id}
                    className={`border border-black border-b-2 rounded-md bg-white ${isDisabled ? 'opacity-60' : ''}`}
                  >
                    <Card.Content className="p-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          {item.image && (
                            <Image
                              src={item.image}
                              alt={item.name}
                              width={48}
                              height={48}
                              className="object-contain shrink-0"
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-black text-lg mb-1">{item.name}</h3>
                              {item.alwaysAvailable && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-semibold">
                                  Always Available
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                          <div
                            className={`flex items-center gap-1 ${!affordable && goldCoins < item.price.goldCoins ? 'text-red-500' : ''}`}
                          >
                            <span className="text-sm font-semibold">{item.price.goldCoins}</span>
                            <Image
                              src="/icons/global/coin.png"
                              alt="Gold Coin"
                              width={20}
                              height={20}
                              className="object-contain"
                            />
                          </div>
                          <Button
                            className={`${
                              isDisabled
                                ? 'bg-gray-200 border border-gray-400 text-gray-500 cursor-not-allowed'
                                : 'bg-transparent border border-black border-b-2 text-black font-semibold hover:bg-gray-100'
                            } rounded-md`}
                            size="sm"
                            onPress={() => handlePurchaseClick(item)}
                            isDisabled={isDisabled}
                          >
                            {isDisabled ? 'Insufficient Coins' : 'Buy'}
                          </Button>
                        </div>
                      </div>
                    </Card.Content>
                  </Card>
                );
              })}
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

      {/* Confirmation Modal */}
      <Modal.Backdrop isOpen={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <Modal.Container size="sm">
          <Modal.Dialog className="bg-background border border-black">
            <Modal.CloseTrigger>
              <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
            </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-lg">Confirm Purchase</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {selectedItem && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  {selectedItem.image && (
                    <Image
                      src={selectedItem.image}
                      alt={selectedItem.name}
                      width={48}
                      height={48}
                      className="object-contain shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-bold text-black text-lg mb-1">{selectedItem.name}</h3>
                    <p className="text-sm text-gray-600">{selectedItem.description}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-700 mb-2">Price:</p>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-black">{selectedItem.price.goldCoins}</span>
                    <Image
                      src="/icons/global/coin.png"
                      alt="Gold Coin"
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                </div>
                {!isAffordable && !selectedItem.alwaysAvailable && (
                  <p className="text-sm text-red-500 font-semibold">
                    {`⚠️ You don't have enough coins to purchase this item!`}
                  </p>
                )}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              className="bg-gray-200 border border-gray-400 text-gray-700 font-semibold rounded-md hover:bg-gray-300"
              onPress={handleCancelPurchase}
              isDisabled={isPurchasing}
            >
              Cancel
            </Button>
            <Button
              className={`${
                isAffordable || selectedItem?.alwaysAvailable
                  ? 'bg-primary border border-black border-b-2 text-black font-semibold hover:bg-[#e68a00]'
                  : 'bg-gray-200 border border-gray-400 text-gray-500 cursor-not-allowed'
              } rounded-md`}
              onPress={handleConfirmPurchase}
              isDisabled={(!isAffordable && !selectedItem?.alwaysAvailable) || isPurchasing}
            >
              {isPurchasing ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
    </>
  );
}
