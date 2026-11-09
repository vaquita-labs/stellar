export type DailyRewardModalProps = {
  open: boolean;
  onOpenChange: () => void;
  coinsToCollect: number;
  experienceToCollect: number;
  streakDays: number;
  onCollect: () => Promise<void>;
  /**
   * `'confirm'` (default): opens on the closed chest, which the user holds to
   * collect. `'reward'`: the caller already collected (the chest on the map is
   * held in place), so it opens straight on the reward screens and never calls
   * `onCollect`.
   */
  startAt?: 'confirm' | 'reward';
};
