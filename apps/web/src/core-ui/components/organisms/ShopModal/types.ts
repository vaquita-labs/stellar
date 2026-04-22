export type ShopModalProps = {
  open: boolean;
  onOpenChange: () => void;
};

export type ShopItem = {
  id: string;
  name: string;
  description: string;
  price: {
    silverCoins?: number;
    goldCoins?: number;
  };
  image?: string;
  alwaysAvailable?: boolean;
};
