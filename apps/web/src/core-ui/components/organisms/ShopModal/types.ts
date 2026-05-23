export type ShopModalProps = {
  open: boolean;
  onOpenChange: () => void;
};

export type ShopItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ShopItemBiome = 'forest' | 'desert' | 'ocean' | 'mountain' | 'plains' | 'any';
export type ShopItemType = 'decoration' | 'boost' | 'theme' | 'expansion' | 'utility';

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  price: {
    goldCoins: number;
  };
  image?: string;
  alwaysAvailable?: boolean;
  biome?: ShopItemBiome;
  type?: ShopItemType;
  rarity?: ShopItemRarity;
};
