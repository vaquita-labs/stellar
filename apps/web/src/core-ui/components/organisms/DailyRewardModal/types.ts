export type DailyRewardModalProps = {
  open: boolean;
  onOpenChange: () => void;
  coinsCollected: number;
  streakDays: number;
};
