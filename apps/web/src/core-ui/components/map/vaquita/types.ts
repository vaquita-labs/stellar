import { DepositSummaryResponseDTO, VaquitaMood } from '@/core-ui/types';

export interface VaquitaControllerProps {
  vaquita: DepositSummaryResponseDTO;
  onSelect?: (vaquita: DepositSummaryResponseDTO) => void;
  headLabel?: string;
  mood?: VaquitaMood;
}
