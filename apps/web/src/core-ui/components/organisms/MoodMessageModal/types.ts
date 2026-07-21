import { VaquitaMood } from '@/core-ui/types';

export type MoodMessageModalProps = {
  open: boolean;
  onOpenChange: () => void;
  mood: VaquitaMood;
};
