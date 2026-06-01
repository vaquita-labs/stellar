import { DepositResponseDTO, DepositSummaryResponseDTO } from '../../../types';

export interface VaquitaModalContentProps {
  isOpen: boolean;
  onClose: () => void;
  vaquita: DepositResponseDTO;
  isLeaderboard?: boolean | false;
}

export interface VaquitaModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaquitaSummary: DepositSummaryResponseDTO;
  isLeaderboard?: boolean | false;
}
