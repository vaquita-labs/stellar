'use client';

import { GenericTable } from '@/core-ui/components';
import { T } from '@/core-ui/components/atoms';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { useBalance, useBalanceServer, useUsers } from '@/core-ui/hooks';
import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { useMemo, useState } from 'react';

const FundWallet = ({ walletAddress: initialWalletAddress }: { walletAddress: string }) => {
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);
  const [amount, setAmount] = useState(0.002);
  const [loadingETH, setLoadingETH] = useState(false);
  const [loadingUSDC, setLoadingUSDC] = useState(false);
  const { data, refetch: refetchW, isLoading, isRefetching } = useBalance(walletAddress);
  const {
    data: dataS,
    refetch: refetchS,
    isLoading: isLoadingS,
    isRefetching: isRefetchingS,
  } = useBalanceServer(walletAddress);

  const loading = isLoading || isRefetching || isLoadingS || isRefetchingS;

  const refetch = () => {
    refetchW();
    refetchS();
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-md">
      <div className="flex flex-col gap-2">
        <T>Wallet Address</T>
        <Input
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="Enter wallet address"
          fullWidth
          size="sm"
          variant="bordered"
        />
        <Input
          type="number"
          value={amount + ''}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="Enter amount"
          fullWidth
          size="sm"
          variant="bordered"
        />
      </div>

      <div className="flex gap-2">
        <Button color="primary" onPress={() => refetch()} isDisabled={!walletAddress}>
          <T>Refetch</T>
        </Button>
        <Button
          color="success"
          onPress={async () => {
            setLoadingETH(true);
            try {
              const response = await fetch(
                `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/user/fund/network/base-sepolia/token/eth`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: walletAddress, amount }),
                }
              );
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fund ETH');
              }
              refetch();
              addToast({ title: 'Success', description: 'ETH funded successfully' });
            } catch (error) {
              addToast({ title: 'Error', description: (error as Error)?.message || 'Failed to fund ETH' });
            } finally {
              setLoadingETH(false);
            }
          }}
          isDisabled={!walletAddress}
        >
          {loadingETH ? <Spinner size="sm" color="white" /> : <T>Fund ETH</T>}
        </Button>
        <Button
          color="secondary"
          onPress={async () => {
            setLoadingUSDC(true);
            try {
              const response = await fetch(
                `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/user/fund/network/base-sepolia/token/usdc`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: walletAddress, amount }),
                }
              );
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fund USDC');
              }
              refetch();
              addToast({ title: 'Success', description: 'USDC funded successfully' });
            } catch (error) {
              addToast({ title: 'Error', description: (error as Error)?.message || 'Failed to fund USDC' });
            } finally {
              setLoadingUSDC(false);
            }
          }}
          isDisabled={!walletAddress}
        >
          {loadingUSDC ? <Spinner size="sm" color="white" /> : <T>Fund USDC</T>}
        </Button>
      </div>
      <div className="mt-4">
        <T>Server Balance</T>
        <div className="font-small">{dataS?.wallet.walletAddress}</div>
        {loading && (
          <div className="flex justify-center items-center py-8">
            <Spinner size="lg" color="primary" />
          </div>
        )}
        {!loading && Array.isArray(dataS?.balances) && dataS.balances.length > 0 && (
          <div className="mt-2 border rounded-md p-2 text-sm bg-gray-50">
            {dataS.balances.map((item, idx) => (
              <div key={idx} className="border-b last:border-0 py-1">
                <div>
                  <strong>Network:</strong> {item?.networkName}
                </div>
                <div>
                  <strong>{item?.tokenSymbol}:</strong> {item?.balance}
                </div>
              </div>
            ))}
          </div>
        )}
        <T>Balance</T>
        {loading && (
          <div className="flex justify-center items-center py-8">
            <Spinner size="lg" color="primary" />
          </div>
        )}
        {!loading && Array.isArray(data?.balances) && data.balances.length > 0 && (
          <div className="mt-2 border rounded-md p-2 text-sm bg-gray-50">
            {data.balances.map((item, idx) => (
              <div key={idx} className="border-b last:border-0 py-1">
                <div>
                  <strong>Network:</strong> {item?.networkName}
                </div>
                <div>
                  <strong>{item?.tokenSymbol}:</strong> {item?.balance}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function Page() {
  const { data, refetch } = useUsers();
  const rows = useMemo(() => data || [], [data]);

  const [item, setItem] = useState<Record<string, Record<string, string>> | null>(null);

  return (
    <>
      <Modal isOpen={!!item} onClose={() => setItem(null)} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>Found</ModalHeader>
          <ModalBody
            className="flex flex-col gap-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setItem(null);
              }
            }}
          >
            {item?.wallet?.address && <FundWallet walletAddress={item?.wallet?.address} />}
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => setItem(null)}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <GenericTable rows={rows} refetch={refetch}>
        {(data) => (
          <div>
            <Button size="sm" onPress={() => setItem(data as Record<string, Record<string, string>>)}>
              <T>Fund</T>
            </Button>
          </div>
        )}
      </GenericTable>
    </>
  );
}
