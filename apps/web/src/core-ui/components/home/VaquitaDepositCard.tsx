import { formatAmount, formatDate, formatTimeDeposit, getInterestData } from '@/core-ui/helpers';
import { useApyByLockPeriod } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { DepositResponseDTO } from '@/core-ui/types';
import { Card, Chip } from '@heroui/react';
import Image from 'next/image';

export const VaquitaDepositCard = ({
  onPress,
  deposit,
}: {
  onPress?: () => void;
  deposit: DepositResponseDTO;
}) => {
  const { network, lockPeriod, token } = useNetworkConfigStore();
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');

  const { vaquitaInterest, aaveInterest, totalInterest } = getInterestData(
    network!,
    dataApy,
    deposit.amount,
    deposit.lockPeriod
  );

  return (
    <Card
      className="border border-success bg-success/10 rounded-md cursor-pointer hover:bg-success/20 transition-colors"
      onClick={onPress}
    >
      <Card.Content className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Image src="/vaquita_working.jpg" alt="Vaquita" width={40} height={40} className="rounded-full" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-black">{formatAmount(deposit.amount, deposit.tokenSymbol)}</p>
              <p className="text-sm text-gray-600">{formatTimeDeposit(deposit.lockPeriod)}</p>
            </div>
          </div>
          <div className="text-right">
            <Chip color="success" size="sm" className="mb-2">
              {deposit.inLockPeriod ? 'Locked' : 'Ready to withdraw'}
            </Chip>
            <p className="text-xs text-gray-500">{formatDate(deposit.createdTimestamp)}</p>
          </div>
        </div>

        {/* Interest information */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">Vaquita Interest</p>
              <p className="text-sm font-semibold text-primary">+{vaquitaInterest.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Protocol Interest</p>
              <p className="text-sm font-semibold text-blue-600">+{aaveInterest.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total earn estimated</p>
              <p className="text-sm font-semibold text-success">+{totalInterest.toFixed(4)}</p>
            </div>
          </div>
        </div>
      </Card.Content>
    </Card>
  );
};
