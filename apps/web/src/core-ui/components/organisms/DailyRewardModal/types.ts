export type DailyRewardModalProps = {
  open: boolean;
  onOpenChange: () => void;
  coinsToCollect: number;
  streakDays: number;
  onCollect: () => Promise<void>;
};
