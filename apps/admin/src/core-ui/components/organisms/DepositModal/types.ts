import { Dispatch, SetStateAction } from 'react';

export type DepositModalProps = {
  open: boolean;
  onOpenChange: () => void;
  isDepositing: boolean;
  setIsDepositing: Dispatch<SetStateAction<boolean>>;
};
