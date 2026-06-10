export type CoinsModalProps = {
  open: boolean;
  onOpenChange: () => void;
  /** Current Gold Coin balance shown in the header. */
  coins: number;
};
