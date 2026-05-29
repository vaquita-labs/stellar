import { DepositSummaryResponseDTO } from '@/core-ui/types';

export interface VaquitaControllerProps {
  vaquita: DepositSummaryResponseDTO;
  onSelect: (vaquita: DepositSummaryResponseDTO) => void;
  tokenSymbol: string;
}
