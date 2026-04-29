'use client';

import { Button, Card, Modal, toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FiArrowDown, FiArrowUp, FiFilter, FiSearch, FiX } from 'react-icons/fi';
import { useProfileRewards } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { ShopItem, ShopItemBiome, ShopItemRarity, ShopItemType } from '../organisms/ShopModal/types';

type SortOption = 'price-asc' | 'price-desc';

const shopItems: ShopItem[] = [
  {
    id: '1',
    name: 'Tree',
    description: 'A beautiful tree to decorate your map. Always available!',
    price: { silverCoins: 1 },
    image: '/icons/summary/streak_freeze.png',
    alwaysAvailable: true,
    biome: 'forest',
    type: 'decoration',
    rarity: 'common',
  },
  {
    id: '2',
    name: 'Streak Freeze',
    description: 'Protect your streak for one day if you cannot maintain it',
    price: { silverCoins: 50 },
    image: '/icons/summary/streak_freeze.png',
    biome: 'any',
    type: 'utility',
    rarity: 'common',
  },
  {
    id: '3',
    name: 'Streak Repair',
    description: 'Restore your streak up to 7 days',
    price: { silverCoins: 100, goldCoins: 1 },
    image: '/icons/summary/streak.png',
    biome: 'any',
    type: 'utility',
    rarity: 'rare',
  },
  {
    id: '4',
    name: 'Tile Pack',
    description: 'Pack of 5 exclusive tiles for your map',
    price: { goldCoins: 3 },
    image: '/icons/summary/edit_map.png',
    biome: 'plains',
    type: 'expansion',
    rarity: 'rare',
  },
  {
    id: '5',
    name: 'Premium Theme',
    description: 'Premium theme to customize your experience',
    price: { goldCoins: 5 },
    image: '/icons/summary/edit.png',
    biome: 'any',
    type: 'theme',
    rarity: 'epic',
  },
  {
    id: '6',
    name: 'Energy Boost',
    description: 'Double your daily rewards for 24 hours',
    price: { silverCoins: 75, goldCoins: 1 },
    image: '/icons/summary/streak.png',
    biome: 'any',
    type: 'boost',
    rarity: 'rare',
  },
  {
    id: '7',
    name: 'Lucky Charm',
    description: 'Increases your chance of getting rare rewards',
    price: { goldCoins: 2 },
    image: '/icons/summary/bag.png',
    biome: 'any',
    type: 'boost',
    rarity: 'epic',
  },
  {
    id: '8',
    name: 'Map Expansion',
    description: 'Unlock additional space for your map',
    price: { goldCoins: 10 },
    image: '/icons/summary/save_map.png',
    biome: 'plains',
    type: 'expansion',
    rarity: 'legendary',
  },
  {
    id: '9',
    name: 'Decorative Fountain',
    description: 'A stunning fountain to enhance your map',
    price: { silverCoins: 150 },
    image: '/icons/summary/edit_map.png',
    biome: 'desert',
    type: 'decoration',
    rarity: 'rare',
  },
  {
    id: '10',
    name: 'Golden Statue',
    description: 'A prestigious golden statue for your collection',
    price: { goldCoins: 15 },
    image: '/icons/summary/gold_coin.png',
    biome: 'mountain',
    type: 'decoration',
    rarity: 'legendary',
  },
];

const biomeOptions: { value: ShopItemBiome; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'forest', label: 'Forest' },
  { value: 'desert', label: 'Desert' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'plains', label: 'Plains' },
];

const typeOptions: { value: ShopItemType; label: string }[] = [
  { value: 'decoration', label: 'Decoration' },
  { value: 'boost', label: 'Boost' },
  { value: 'theme', label: 'Theme' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'utility', label: 'Utility' },
];

const rarityOptions: { value: ShopItemRarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'rare', label: 'Rare' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
];

const rarityStyles: Record<ShopItemRarity, { badge: string; ring: string }> = {
  common: { badge: 'bg-gray-100 text-gray-700 border-gray-300', ring: 'ring-gray-300' },
  rare: { badge: 'bg-blue-100 text-blue-700 border-blue-300', ring: 'ring-blue-300' },
  epic: { badge: 'bg-purple-100 text-purple-700 border-purple-300', ring: 'ring-purple-300' },
  legendary: { badge: 'bg-amber-100 text-amber-800 border-amber-400', ring: 'ring-amber-400' },
};

function priceValue(item: ShopItem): number {
  return (item.price.silverCoins ?? 0) + (item.price.goldCoins ?? 0) * 100;
}

export function ShopPage() {
  const { data: profileRewards, refetch } = useProfileRewards();
  const queryClient = useQueryClient();
  const { network, walletAddress } = useNetworkConfigStore();

  const [search, setSearch] = useState('');
  const [biomes, setBiomes] = useState<ShopItemBiome[]>([]);
  const [types, setTypes] = useState<ShopItemType[]>([]);
  const [rarities, setRarities] = useState<ShopItemRarity[]>([]);
  const [sort, setSort] = useState<SortOption>('price-asc');

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ShopItem | null>(null);
  const [offerMode, setOfferMode] = useState(false);
  const [offerSilver, setOfferSilver] = useState('');
  const [offerGold, setOfferGold] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isOffering, setIsOffering] = useState(false);

  const silverCoins = profileRewards?.rewards?.find((r) => r?.name === 'Silver Coin')?.amount ?? 0;
  const goldCoins = profileRewards?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;

  const activeFilterCount = biomes.length + types.length + rarities.length;

  const canAfford = (item: ShopItem): boolean => {
    if (item.alwaysAvailable) return true;
    const okSilver = !item.price.silverCoins || silverCoins >= item.price.silverCoins;
    const okGold = !item.price.goldCoins || goldCoins >= item.price.goldCoins;
    return okSilver && okGold;
  };

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = shopItems.filter((item) => {
      if (biomes.length && (!item.biome || !biomes.includes(item.biome))) return false;
      if (types.length && (!item.type || !types.includes(item.type))) return false;
      if (rarities.length && (!item.rarity || !rarities.includes(item.rarity))) return false;
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
    });
    return filtered.sort((a, b) => {
      const diff = priceValue(a) - priceValue(b);
      return sort === 'price-asc' ? diff : -diff;
    });
  }, [search, biomes, types, rarities, sort]);

  const closeDetail = () => {
    setDetailItem(null);
    setOfferMode(false);
    setOfferSilver('');
    setOfferGold('');
  };

  const handleBuy = async () => {
    if (!detailItem || isPurchasing) return;
    setIsPurchasing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await queryClient.invalidateQueries({
        queryKey: ['profile', network?.name, walletAddress, 'profile-rewards'],
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
    const silver = Number(offerSilver) || 0;
    const gold = Number(offerGold) || 0;
    if (silver <= 0 && gold <= 0) {
      toast.danger('Invalid offer', { description: 'Enter at least 1 silver or gold coin.', timeout: 3000 });
      return;
    }
    if (silver > silverCoins || gold > goldCoins) {
      toast.danger('Not enough coins', { description: 'Your offer exceeds your balance.', timeout: 3000 });
      return;
    }
    setIsOffering(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success('Offer submitted!', {
        description: `Offered ${silver ? `${silver} silver` : ''}${silver && gold ? ' + ' : ''}${gold ? `${gold} gold` : ''} for ${detailItem.name}`,
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
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-[#B97204]">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/home"
            aria-label="Back to home"
            className="flex h-10 w-10 items-center justify-center shrink-0"
          >
            <Image src="/icons/arrow-back.svg" alt="back" width={28} height={28} />
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/icons/summary/shop.png" alt="shop" width={24} height={24} />
            <h1 className="text-lg sm:text-xl font-bold text-black">Shop</h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-white border border-black border-b-2 rounded-md px-2 py-1">
              <Image
                src="/icons/summary/silver_coin.png"
                alt="Silver Coin"
                width={20}
                height={20}
                className="object-contain"
              />
              <span className="text-sm font-semibold text-black">{silverCoins}</span>
            </div>
            <div className="flex items-center gap-1 bg-white border border-black border-b-2 rounded-md px-2 py-1">
              <Image
                src="/icons/summary/gold_coin.png"
                alt="Gold Coin"
                width={20}
                height={20}
                className="object-contain"
              />
              <span className="text-sm font-semibold text-black">{goldCoins}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-4 flex flex-col gap-4 pb-24">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 bg-white border border-black border-b-2 rounded-md px-3 py-2">
            <FiSearch className="text-gray-500 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="flex-1 bg-transparent text-sm text-black placeholder:text-gray-500 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="text-gray-500 hover:text-black"
              >
                <FiX />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex items-center justify-center gap-1.5 bg-white border border-black border-b-2 rounded-md px-2.5 py-1 text-xs font-semibold text-black hover:bg-[#FFF7E6] whitespace-nowrap"
            >
              <FiFilter className="text-sm" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-bold bg-primary text-black border border-black rounded-full min-w-4 h-4 px-1 inline-flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSort((prev) => (prev === 'price-asc' ? 'price-desc' : 'price-asc'))}
              className="flex items-center justify-center gap-1.5 bg-white border border-black border-b-2 rounded-md px-2.5 py-1 text-xs font-semibold text-black hover:bg-[#FFF7E6] whitespace-nowrap"
            >
              {sort === 'price-asc' ? <FiArrowUp className="text-sm" /> : <FiArrowDown className="text-sm" />}
              <span>Price</span>
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
            <Image src="/icons/summary/shop.png" alt="shop" width={48} height={48} className="opacity-60" />
            <p className="text-sm text-gray-600">No items match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => {
              const affordable = canAfford(item);
              const rarityStyle = item.rarity ? rarityStyles[item.rarity] : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetailItem(item)}
                  className="text-left h-full"
                >
                  <Card
                    className={`h-full border border-black border-b-2 rounded-md bg-white transition hover:-translate-y-0.5 hover:shadow-md ${
                      !affordable && !item.alwaysAvailable ? 'opacity-70' : ''
                    } ${rarityStyle ? `ring-1 ${rarityStyle.ring}` : ''}`}
                  >
                    <Card.Content className="p-3 flex flex-col gap-2 h-full">
                      <div className="relative w-full aspect-square bg-[#FFF7E6] border border-black/10 rounded-md flex items-center justify-center overflow-hidden">
                        {item.rarity && rarityStyle && (
                          <span
                            className={`absolute top-1 left-1 text-[10px] font-bold uppercase tracking-wide border rounded-sm px-1.5 py-0.5 ${rarityStyle.badge}`}
                          >
                            {item.rarity}
                          </span>
                        )}
                        {item.alwaysAvailable && (
                          <span className="absolute top-1 right-1 text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-800 border border-green-300 rounded-sm px-1.5 py-0.5">
                            Always
                          </span>
                        )}
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            width={96}
                            height={96}
                            className="object-contain"
                          />
                        ) : (
                          <Image
                            src="/icons/summary/bag.png"
                            alt={item.name}
                            width={64}
                            height={64}
                            className="object-contain opacity-60"
                          />
                        )}
                      </div>

                      <h3 className="font-bold text-black text-sm truncate">{item.name}</h3>

                      <div className="mt-auto flex items-center gap-3 flex-nowrap">
                        {item.price.silverCoins ? (
                          <div
                            className={`flex items-center gap-1 ${
                              !affordable && silverCoins < item.price.silverCoins ? 'text-red-500' : 'text-black'
                            }`}
                          >
                            <Image
                              src="/icons/summary/silver_coin.png"
                              alt="Silver"
                              width={16}
                              height={16}
                              className="object-contain shrink-0"
                            />
                            <span className="text-sm font-bold">{item.price.silverCoins}</span>
                          </div>
                        ) : null}
                        {item.price.goldCoins ? (
                          <div
                            className={`flex items-center gap-1 ${
                              !affordable && goldCoins < item.price.goldCoins ? 'text-red-500' : 'text-black'
                            }`}
                          >
                            <Image
                              src="/icons/summary/gold_coin.png"
                              alt="Gold"
                              width={16}
                              height={16}
                              className="object-contain shrink-0"
                            />
                            <span className="text-sm font-bold">{item.price.goldCoins}</span>
                          </div>
                        ) : null}
                      </div>
                    </Card.Content>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Modal.Backdrop isOpen={!!detailItem} onOpenChange={(o) => { if (!o) closeDetail(); }}>
        <Modal.Container size="md">
          <Modal.Dialog className="bg-background border border-black">
            <Modal.CloseTrigger>
              <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className="text-black font-bold text-lg">
                {detailItem?.name ?? 'Item'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {detailItem && (
                <div className="space-y-4">
                  <div className="w-full aspect-square max-h-56 bg-[#FFF7E6] border border-black/10 rounded-md flex items-center justify-center overflow-hidden">
                    {detailItem.image ? (
                      <Image
                        src={detailItem.image}
                        alt={detailItem.name}
                        width={160}
                        height={160}
                        className="object-contain"
                      />
                    ) : (
                      <Image
                        src="/icons/summary/bag.png"
                        alt={detailItem.name}
                        width={120}
                        height={120}
                        className="object-contain opacity-60"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {detailItem.rarity && (
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide border rounded-sm px-2 py-0.5 ${rarityStyles[detailItem.rarity].badge}`}
                      >
                        {detailItem.rarity}
                      </span>
                    )}
                    {detailItem.type && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide bg-[#DDF4FF] text-black border border-[#84D8FF] rounded-sm px-2 py-0.5">
                        {detailItem.type}
                      </span>
                    )}
                    {detailItem.biome && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide bg-[#FFF7E6] text-black border border-[#B97204]/40 rounded-sm px-2 py-0.5">
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
                    <div className="flex items-center gap-3">
                      {detailItem.price.silverCoins ? (
                        <div className="flex items-center gap-1">
                          <Image
                            src="/icons/summary/silver_coin.png"
                            alt="Silver"
                            width={24}
                            height={24}
                            className="object-contain"
                          />
                          <span className="text-lg font-bold text-black">{detailItem.price.silverCoins}</span>
                        </div>
                      ) : null}
                      {detailItem.price.goldCoins ? (
                        <div className="flex items-center gap-1">
                          <Image
                            src="/icons/summary/gold_coin.png"
                            alt="Gold"
                            width={24}
                            height={24}
                            className="object-contain"
                          />
                          <span className="text-lg font-bold text-black">{detailItem.price.goldCoins}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {offerMode && (
                    <div className="pt-2 border-t border-gray-200 space-y-3">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Your offer</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex items-center gap-2 bg-white border border-black rounded-md px-2 py-1.5 min-w-0">
                            <Image
                              src="/icons/summary/silver_coin.png"
                              alt="Silver"
                              width={20}
                              height={20}
                              className="object-contain shrink-0"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={offerSilver}
                              onChange={(e) => setOfferSilver(e.target.value.replace(/[^\d]/g, ''))}
                              placeholder="0"
                              className="flex-1 min-w-0 w-full bg-transparent text-sm text-black outline-none"
                            />
                          </div>
                          <p className="text-[11px] text-gray-500 px-1">You have {silverCoins}</p>
                        </div>
                        <div className="min-w-0 flex flex-col gap-1">
                          <div className="flex items-center gap-2 bg-white border border-black rounded-md px-2 py-1.5 min-w-0">
                            <Image
                              src="/icons/summary/gold_coin.png"
                              alt="Gold"
                              width={20}
                              height={20}
                              className="object-contain shrink-0"
                            />
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
                      setOfferSilver('');
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

      {filtersOpen && (
        <FiltersPanel
          biomes={biomes}
          types={types}
          rarities={rarities}
          onApply={(next) => {
            setBiomes(next.biomes);
            setTypes(next.types);
            setRarities(next.rarities);
            setFiltersOpen(false);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}

type FilterValues = {
  biomes: ShopItemBiome[];
  types: ShopItemType[];
  rarities: ShopItemRarity[];
};

type FiltersPanelProps = FilterValues & {
  onApply: (next: FilterValues) => void;
  onClose: () => void;
};

function FiltersPanel({ biomes, types, rarities, onApply, onClose }: FiltersPanelProps) {
  const [draftBiomes, setDraftBiomes] = useState<ShopItemBiome[]>(biomes);
  const [draftTypes, setDraftTypes] = useState<ShopItemType[]>(types);
  const [draftRarities, setDraftRarities] = useState<ShopItemRarity[]>(rarities);

  const clearAll = () => {
    setDraftBiomes([]);
    setDraftTypes([]);
    setDraftRarities([]);
  };

  const draftCount = draftBiomes.length + draftTypes.length + draftRarities.length;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="border-b border-[#B97204] bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center shrink-0"
          >
            <Image src="/icons/arrow-back.svg" alt="back" width={28} height={28} />
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-black">Filters</h1>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-semibold text-black underline disabled:text-gray-400 disabled:no-underline"
            disabled={draftCount === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 flex flex-col gap-6 pb-6">
          <FilterSection
            title="Biome"
            values={draftBiomes}
            onChange={setDraftBiomes}
            options={biomeOptions}
          />
          <FilterSection
            title="Type"
            values={draftTypes}
            onChange={setDraftTypes}
            options={typeOptions}
          />
          <FilterSection
            title="Rarity"
            values={draftRarities}
            onChange={setDraftRarities}
            options={rarityOptions}
          />
        </div>
      </div>

      <div className="border-t border-[#B97204] bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 flex gap-2">
          <Button
            className="flex-1 bg-white border border-black border-b-2 text-black font-semibold rounded-md hover:bg-gray-100"
            onPress={onClose}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-primary border border-black border-b-2 text-black font-semibold rounded-md hover:bg-[#e68a00]"
            onPress={() => onApply({ biomes: draftBiomes, types: draftTypes, rarities: draftRarities })}
          >
            Apply{draftCount > 0 ? ` (${draftCount})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

type FilterSectionProps<T extends string> = {
  title: string;
  values: T[];
  onChange: (values: T[]) => void;
  options: { value: T; label: string }[];
};

function FilterSection<T extends string>({ title, values, onChange, options }: FilterSectionProps<T>) {
  const toggle = (value: T) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {values.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-semibold text-gray-500 hover:text-black"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              aria-pressed={active}
              className={`text-sm font-semibold rounded-md px-3 py-2 border border-black ${
                active ? 'bg-primary text-black border-b-2' : 'bg-white text-black hover:bg-[#FFF7E6]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
