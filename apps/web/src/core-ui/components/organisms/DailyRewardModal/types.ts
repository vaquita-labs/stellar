export type DailyRewardModalProps = {
  open: boolean;
  onOpenChange: () => void;
  coinsToCollect: number;
  experienceToCollect: number;
  streakDays: number;
  onCollect: () => Promise<void>;
};
