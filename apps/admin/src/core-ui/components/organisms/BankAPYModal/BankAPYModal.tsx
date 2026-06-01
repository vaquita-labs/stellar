'use client';

import { Card, Chip, Separator, Spinner } from '@heroui/react';
import Image from 'next/image';
import { formatTimeDeposit } from '../../../helpers';
import { useApyByLockPeriod, useDeposits } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { DepositWithdrawalState } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { BankAPYModalProps } from './types';

export function BankAPYModal({ open, onOpenChange }: BankAPYModalProps) {
  const { network, lockPeriod, walletAddress, token } = useNetworkConfigStore();
  const { data: dataApy, isLoading: isLoadingApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const { data: depositsData, isLoading: isLoadingDeposits } = useDeposits(walletAddress);

  const protocolApy = dataApy?.protocolApy ?? 0;
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const APYNetwork = protocolApy.toFixed(2);
  const APYNetworkLabel = dataApy?.lendingMarketName ?? '';
  const APYVaquita = vaquitaApy.toFixed(2);
  const APYTotal = (+APYNetwork + +APYVaquita).toFixed(2);
  const rewardPool = dataApy?.rewardPool ?? 0;

  // Calculate total deposits
  const deposits = (depositsData?.deposits ?? []).filter(
    (deposit) => deposit.lockPeriod === lockPeriod && deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS
  );

  const totalDeposits = deposits.reduce((acc, deposit) => acc + deposit.amount, 0);
  const tokenSymbol = deposits[0]?.tokenSymbol ?? token?.symbol ?? 'USDC';
  const isLoading = isLoadingApy || isLoadingDeposits;
  const totalDepositsallUsers = dataApy?.totalDeposits ?? 0;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Bank Rewards"
      titleIcon="/icons/medal.svg"
      titleIconAlt="rewards"
      size="lg"
    >
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Spinner size="lg" color="accent" />
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {/* Total Deposits Card */}
          <div className="flex flex-row gap-1 flex-wrap ">
            <Chip color="warning" className="rounded-md w-full">
              <span>Lock Period </span>
              <b className="text-xs">{formatTimeDeposit(lockPeriod)}</b>
            </Chip>
            <Chip className="bg-[#3272B3] text-white rounded-md w-full">
              <span>Reward Pool </span>
              <b className="text-xs">
                {rewardPool.toFixed(2)} {tokenSymbol}
              </b>
            </Chip>
            <Chip color="accent" className="rounded-md w-full flex flex-row gap-2">
              <span>All users deposits </span>
              <b className="text-xs">
                {totalDepositsallUsers.toFixed(2)} {tokenSymbol}
              </b>
            </Chip>
          </div>
          <div className="flex gap-2 md:flex-row flex-col ">
            <Card className="border-primary border-1 bg-primary/10 rounded-md w-full">
              <Card.Content className="p-6">
                <div className="text-center flex flex-col gap-2 justify-between">
                  <p className="text-sm text-primary mb-2">Total Deposited</p>
                  <div className="flex items-center justify-center gap-2">
                    <Image src="/icons/bag.svg" alt="medal" width={32} height={32} />
                    <div className="flex gap-0">
                      <p className="text-2xl font-bold text-primary">{totalDeposits.toFixed(2)}</p>
                      <span className="text-sm font-semibold text-primary mt-2.5">{tokenSymbol}</span>
                    </div>
                  </div>
                </div>
              </Card.Content>
            </Card>

            {/* APY Total Card */}
            <Card className="border-success border-1 bg-success/10 rounded-md w-full">
              <Card.Content className="p-6">
                <div className="text-center flex flex-col gap-2 justify-between">
                  <p className="text-sm text-success mb-2">Total APY</p>
                  <div className="flex items-center justify-center gap-2">
                    <Image src="/icons/medal.svg" alt="medal" width={32} height={32} />
                    <p className="text-xl font-bold text-success">{APYTotal}%</p>
                  </div>
                </div>
              </Card.Content>
            </Card>
          </div>

          {/* APY Breakdown */}
          <Card className="border-gray-200 rounded-md border-1 border-dashed">
            <Card.Content className="p-4">
              <h3 className="font-semibold text-lg mb-4 text-black">APY Breakdown</h3>

              <div className="space-y-4">
                {/* Vaquita APY */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-primary rounded-full"></div>
                      <span className="text-gray-700 font-medium">Vaquita APY</span>
                    </div>
                    <span className="text-xl font-bold text-primary">{APYVaquita}%</span>
                  </div>
                  <p className="text-sm text-gray-600 ml-5">
                    Rewards distributed from the Vaquita community pool based on your lock period
                  </p>
                </div>

                {/* Protocol APY (if available) */}
                {!!APYNetworkLabel && +APYNetwork >= 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                          <span className="text-gray-700 font-medium">{APYNetworkLabel} APY</span>
                        </div>
                        <span className="text-xl font-bold text-purple-600">{APYNetwork}%</span>
                      </div>
                      <p className="text-sm text-gray-600 ml-5">
                        Additional yield from {APYNetworkLabel} lending protocol where your funds are deposited
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card.Content>
          </Card>

          {/* How it works */}
          <Card className="border-primary bg-primary/20 rounded-md border-1">
            <Card.Content className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-black mb-2">How Rewards Work</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• Your deposit generates yield from multiple sources.</li>
                    <li>• Estimated rewards are calculated using the current APY.</li>
                    <li>• The APY is dynamic and may fluctuate based on user activity and total deposits.</li>
                    <li>• Rewards become claimable only after the saving period ends.</li>
                    <li>• Final rewards are confirmed upon withdrawal.</li>
                  </ul>
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* Network info */}
          {network && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-4">
              <span>Network:</span>
              <span className="font-semibold text-black">{network.name}</span>
            </div>
          )}
        </div>
      )}
    </AppModal>
  );
}
