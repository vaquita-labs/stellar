'use client';

import { Button, toast } from '@heroui/react';
import {
  buildErc20AllowanceCall,
  buildErc20ApproveTx,
  buildEvmToStellarBurnTx,
} from '@/networks/evm/cctp';
import { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import {
  type BridgeDirection,
  type BridgeNetworkKey,
  type BridgeTransfer,
  useBridgeTransfers,
} from '../../../hooks';
import { AppModal } from '../../molecules/AppModal';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const evmOptions: { key: BridgeNetworkKey; label: string }[] = [
  { key: 'ethereum-sepolia', label: 'Ethereum Sepolia' },
  { key: 'base-sepolia', label: 'Base Sepolia' },
  { key: 'base', label: 'Base' },
  { key: 'ethereum', label: 'Ethereum' },
];

const evmChainConfig: Partial<Record<BridgeNetworkKey, { chainIdHex: string; usdc: `0x${string}` }>> = {
  'base-sepolia': {
    chainIdHex: '0x14a34',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'ethereum-sepolia': {
    chainIdHex: '0xaa36a7',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  base: {
    chainIdHex: '0x2105',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  ethereum: {
    chainIdHex: '0x1',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
};

const statusLabel: Record<string, string> = {
  source_awaiting_signature: 'Ready to send',
  source_confirming: 'Sending from your wallet',
  attestation_pending: 'Confirming deposit',
  ready_to_complete: 'Sending funds to Stellar',
  destination_awaiting_signature: 'Preparing receive step',
  destination_confirming: 'Confirming receive step',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  needs_review: 'Needs a look',
};

const bridgeProgressByStatus: Record<string, { current: number; total: number; detail: string }> = {
  source_awaiting_signature: { current: 1, total: 5, detail: 'Approve USDC, then send it from your wallet' },
  source_confirming: { current: 2, total: 5, detail: 'Your send transaction is confirming' },
  attestation_pending: { current: 3, total: 5, detail: 'Circle is checking the transfer' },
  ready_to_complete: { current: 4, total: 5, detail: 'Vaquita is finishing the receive step on Stellar' },
  destination_awaiting_signature: { current: 4, total: 5, detail: 'Receive step is getting ready' },
  destination_confirming: { current: 4, total: 5, detail: 'Receive step is confirming' },
  completed: { current: 5, total: 5, detail: 'USDC arrived' },
  failed: { current: 5, total: 5, detail: 'Transfer failed and needs support' },
  cancelled: { current: 5, total: 5, detail: 'Transfer was cancelled' },
  needs_review: { current: 5, total: 5, detail: 'Transfer needs support' },
};

const progressFor = (status: string) => bridgeProgressByStatus[status] ?? { current: 1, total: 5, detail: 'Getting your transfer ready' };
const isTransferInProgress = (status: string) => !['completed', 'failed', 'cancelled', 'needs_review'].includes(status);

const balanceOfCallData = (address: string) =>
  `0x70a08231000000000000000000000000${address.replace(/^0x/, '').toLowerCase()}`;

const humanToUsdcRaw = (value: string): bigint | null => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const parts = trimmed.split('.');
  const whole = parts[0] ?? '0';
  const fraction = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fraction || '0');
};

const rawUsdcToHuman = (raw: bigint) => {
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
};

const hexToBigInt = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return 0n;
  return BigInt(value);
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const chainIdsMatch = (actual: unknown, expected: string) => {
  if (typeof actual !== 'string') return false;
  try {
    return BigInt(actual) === BigInt(expected);
  } catch {
    return actual.toLowerCase() === expected.toLowerCase();
  }
};

interface BridgeUsdcModalProps {
  open: boolean;
  onOpenChange: () => void;
  stellarWallet: string;
}

export function BridgeUsdcModal({ open, onOpenChange, stellarWallet }: BridgeUsdcModalProps) {
  const { t } = useTranslation();
  const { listTransfers, listCompletedTransfers, createTransfer, attachSourceTx, getFeeQuote } = useBridgeTransfers();
  const [direction, setDirection] = useState<BridgeDirection>('evm_to_stellar');
  const [evmNetwork, setEvmNetwork] = useState<BridgeNetworkKey>('ethereum-sepolia');
  const [evmWallet, setEvmWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);
  const [completedTransfers, setCompletedTransfers] = useState<BridgeTransfer[]>([]);
  const [evmUsdcBalanceRaw, setEvmUsdcBalanceRaw] = useState<bigint | null>(null);
  const [evmAllowanceRaw, setEvmAllowanceRaw] = useState<bigint | null>(null);
  const [evmBalanceError, setEvmBalanceError] = useState('');
  const [evmChainMismatch, setEvmChainMismatch] = useState(false);
  const [evmBalanceLoading, setEvmBalanceLoading] = useState(false);
  const [evmAllowanceLoading, setEvmAllowanceLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const sourceNetwork = direction === 'evm_to_stellar' ? evmNetwork : 'stellar-testnet';
  const destinationNetwork = direction === 'evm_to_stellar' ? 'stellar-testnet' : evmNetwork;
  const sourceWallet = direction === 'evm_to_stellar' ? evmWallet : stellarWallet;
  const destinationWallet = direction === 'evm_to_stellar' ? stellarWallet : evmWallet;
  const selectedEvmLabel = evmOptions.find((option) => option.key === evmNetwork)?.label ?? evmNetwork;
  const amountRaw = humanToUsdcRaw(amount);
  const hasEnoughEvmUsdc =
    direction !== 'evm_to_stellar' ||
    evmUsdcBalanceRaw === null ||
    amountRaw === null ||
    amountRaw <= evmUsdcBalanceRaw;
  const canCreate = !!sourceWallet && !!destinationWallet && !!amountRaw && amountRaw > 0n && hasEnoughEvmUsdc;
  const needsEvmApproval =
    direction === 'evm_to_stellar' &&
    amountRaw !== null &&
    evmAllowanceRaw !== null &&
    evmAllowanceRaw < amountRaw;
  const bridgeActionLabel = direction === 'evm_to_stellar'
    ? needsEvmApproval
      ? 'Approve USDC'
      : 'Send USDC'
    : 'Start transfer';
  const currentWallets = useMemo(
    () => [stellarWallet, evmWallet].filter(Boolean),
    [stellarWallet, evmWallet],
  );

  const reload = async () => {
    const [activeLists, completedLists] = await Promise.all([
      Promise.all(currentWallets.map((wallet) => listTransfers(wallet))),
      Promise.all(currentWallets.map((wallet) => listCompletedTransfers(wallet))),
    ]);
    const activeById = new Map<string, BridgeTransfer>();
    const completedById = new Map<string, BridgeTransfer>();
    activeLists.flat().forEach((transfer) => activeById.set(transfer.id, transfer));
    completedLists.flat().forEach((transfer) => completedById.set(transfer.id, transfer));
    setTransfers([...activeById.values()]);
    setCompletedTransfers([...completedById.values()]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3));
  };

  useEffect(() => {
    if (!open || currentWallets.length === 0) return;
    void reload().catch((error) => console.warn('[bridge] list failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentWallets.join('|')]);

  useEffect(() => {
    if (!open || currentWallets.length === 0) return;
    const interval = window.setInterval(() => {
      void reload().catch((error) => console.warn('[bridge] poll failed', error));
    }, 60_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentWallets.join('|')]);

  const connectEvm = async () => {
    if (!window.ethereum) {
      toast.danger(t('wallet.bridge.noInjectedWallet', 'No EVM wallet found'));
      return;
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    setEvmWallet(accounts?.[0] ?? '');
  };

  const refreshEvmUsdcBalance = async () => {
    if (!window.ethereum || !evmWallet) return;
    const chain = evmChainConfig[evmNetwork];
    if (!chain) return;

    setEvmBalanceLoading(true);
    setEvmBalanceError('');
    setEvmChainMismatch(false);
    try {
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
      if (!chainIdsMatch(currentChainId, chain.chainIdHex)) {
        setEvmUsdcBalanceRaw(null);
        setEvmChainMismatch(true);
        setEvmBalanceError(`Switch your wallet to ${selectedEvmLabel}`);
        return;
      }

      const balance = await window.ethereum.request({
        method: 'eth_call',
        params: [
          {
            to: chain.usdc,
            data: balanceOfCallData(evmWallet),
          },
          'latest',
        ],
      }) as string;
      setEvmUsdcBalanceRaw(BigInt(balance));
    } catch (error) {
      setEvmUsdcBalanceRaw(null);
      setEvmBalanceError(error instanceof Error ? error.message : 'Could not read your USDC balance');
    } finally {
      setEvmBalanceLoading(false);
    }
  };

  const assertSelectedEvmChain = async (network: BridgeNetworkKey) => {
    if (!window.ethereum) throw new Error('No EVM wallet found');
    const chain = evmChainConfig[network];
    if (!chain) throw new Error(`Unsupported EVM network: ${network}`);
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
    if (!chainIdsMatch(currentChainId, chain.chainIdHex)) {
      throw new Error(`Switch your wallet to ${network}`);
    }
  };

  const readEvmAllowance = async (network: BridgeNetworkKey, wallet: string) => {
    if (!window.ethereum || !wallet) return null;
    await assertSelectedEvmChain(network);
    const allowanceCall = buildErc20AllowanceCall(network, wallet);
    return hexToBigInt(await window.ethereum.request({
      method: 'eth_call',
      params: [
        {
          from: wallet,
          to: allowanceCall.to,
          data: allowanceCall.data,
        },
        'latest',
      ],
    }));
  };

  const refreshEvmAllowance = async () => {
    if (direction !== 'evm_to_stellar' || !evmWallet) return;
    setEvmAllowanceLoading(true);
    try {
      setEvmAllowanceRaw(await readEvmAllowance(evmNetwork, evmWallet));
    } catch (error) {
      setEvmAllowanceRaw(null);
      console.warn('[bridge] allowance check failed', error);
    } finally {
      setEvmAllowanceLoading(false);
    }
  };

  const waitForEvmReceipt = async (txHash: string) => {
    if (!window.ethereum) throw new Error('No EVM wallet found');
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const receipt = await window.ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }) as { status?: string } | null;
      if (receipt) {
        if (receipt.status && receipt.status !== '0x1') {
          throw new Error('EVM transaction reverted');
        }
        return receipt;
      }
      await sleep(2_000);
    }
    throw new Error('Timed out waiting for approval confirmation');
  };

  const switchEvmNetwork = async () => {
    if (!window.ethereum) {
      toast.danger(t('wallet.bridge.noInjectedWallet', 'No EVM wallet found'));
      return;
    }
    const chain = evmChainConfig[evmNetwork];
    if (!chain) return;
    setLoading(true);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chain.chainIdHex }],
      });
      await refreshEvmUsdcBalance();
    } catch (error) {
      toast.danger(t('wallet.bridge.switchFailed', 'Network switch failed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !evmWallet) return;
    void refreshEvmUsdcBalance();
    void refreshEvmAllowance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evmWallet, evmNetwork, direction]);

  useEffect(() => {
    if (!open || !evmWallet || direction !== 'evm_to_stellar') return;
    const interval = window.setInterval(() => {
      void refreshEvmUsdcBalance();
      void refreshEvmAllowance();
    }, 10_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evmWallet, evmNetwork, direction]);

  const runAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
      await reload();
    } catch (error) {
      toast.danger(t('wallet.bridge.actionFailed', 'Bridge action failed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const createDraftTransfer = () => createTransfer({
    direction,
    sourceNetwork,
    destinationNetwork,
    sourceWallet,
    destinationWallet,
    amount,
  });

  const startEvmToStellarBridge = () => runAction(async () => {
    if (direction !== 'evm_to_stellar') {
      await createDraftTransfer();
      return;
    }
    if (!amountRaw) throw new Error('Enter an amount before bridging');
    const allowance = await readEvmAllowance(evmNetwork, evmWallet);
    setEvmAllowanceRaw(allowance);
    if (allowance === null || allowance < amountRaw) {
      const approval = buildErc20ApproveTx(evmNetwork, amountRaw);
      const approvalHash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [{
          from: evmWallet,
          to: approval.to,
          data: approval.data,
        }],
      }) as string;
      await waitForEvmReceipt(approvalHash);
      setEvmAllowanceRaw(await readEvmAllowance(evmNetwork, evmWallet));
      toast.success(t('wallet.bridge.approvalReady', 'USDC approval confirmed. You can now send.'));
      return;
    }
    const transfer = await createDraftTransfer();
    await signEvmSourceBurnFor(transfer);
  });

  const signEvmSourceBurnFor = async (transfer: BridgeTransfer) => {
    if (!window.ethereum) throw new Error('No EVM wallet found');
    if (transfer.direction !== 'evm_to_stellar') {
      throw new Error('This send step is only available for EVM to Stellar transfers');
    }
    if (transfer.status !== 'source_awaiting_signature') {
      throw new Error('This transfer already has a send transaction');
    }
    if (transfer.sourceWallet.toLowerCase() !== evmWallet.toLowerCase()) {
      throw new Error('Connected wallet does not match the wallet you send from');
    }

    await assertSelectedEvmChain(transfer.sourceNetwork);

    const amountRaw = BigInt(transfer.amountRaw);
    const allowance = await readEvmAllowance(transfer.sourceNetwork, transfer.sourceWallet);
    if (allowance === null || allowance < amountRaw) {
      throw new Error('USDC is not approved yet');
    }

    const burn = buildEvmToStellarBurnTx({
      sourceNetwork: transfer.sourceNetwork,
      destinationNetwork: transfer.destinationNetwork,
      amount: amountRaw,
      maxFee: BigInt((await getFeeQuote({
        sourceNetwork: transfer.sourceNetwork,
        destinationNetwork: transfer.destinationNetwork,
        amountRaw: amountRaw.toString(),
      })).maxFeeRaw),
      forwardRecipientStrkey: transfer.destinationWallet,
    });
    const sourceHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: transfer.sourceWallet,
        to: burn.to,
        data: burn.data,
      }],
    }) as string;

    await attachSourceTx(transfer.id, { sourceTxHash: sourceHash });
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.bridge.title', 'Send USDC')}
      size="lg"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      <section className="flex flex-col gap-3 rounded-lg border border-black border-b-2 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className={`rounded-md border border-black border-b-2 ${direction === 'evm_to_stellar' ? 'bg-primary' : 'bg-white'} text-black`}
            onPress={() => setDirection('evm_to_stellar')}
          >
            To Stellar
          </Button>
          <Button
            className={`rounded-md border border-black border-b-2 ${direction === 'stellar_to_evm' ? 'bg-primary' : 'bg-white'} text-black`}
            onPress={() => setDirection('stellar_to_evm')}
          >
            From Stellar
          </Button>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-black">
          Choose blockchain you send from
          <select
            className="h-11 rounded-md border border-black border-b-2 bg-white px-3 text-sm"
            value={evmNetwork}
            onChange={(event) => setEvmNetwork(event.target.value as BridgeNetworkKey)}
          >
            {evmOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-sm font-semibold text-black">
            Wallet you send from
            <input
              value={evmWallet}
              onChange={(event) => setEvmWallet(event.target.value)}
              className="h-11 rounded-md border border-black border-b-2 bg-white px-3 text-sm font-normal"
            />
          </label>
          <Button className="self-end rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black" onPress={connectEvm}>
            Connect
          </Button>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-black">
          Amount
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            min="0"
            step="0.000001"
            className="h-11 rounded-md border border-black border-b-2 bg-white px-3 text-sm font-normal"
          />
        </label>
        <div className="flex items-center justify-between gap-3 rounded-md bg-[#F5FBFF] p-3 text-xs text-gray-700">
          <span>
            {evmBalanceLoading
              ? `Checking your ${selectedEvmLabel} USDC...`
              : evmBalanceError
                ? evmBalanceError
                : evmUsdcBalanceRaw !== null
                  ? `${selectedEvmLabel} USDC available: ${rawUsdcToHuman(evmUsdcBalanceRaw)} USDC`
                  : 'Connect your wallet to check USDC'}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {evmChainMismatch ? (
              <button
                type="button"
                onClick={switchEvmNetwork}
                disabled={!evmWallet || loading}
                className="font-semibold underline underline-offset-2 disabled:opacity-50"
              >
                Switch network
              </button>
            ) : null}
          </div>
        </div>
        {!hasEnoughEvmUsdc ? (
          <p className="text-xs font-semibold text-danger">Amount is higher than your available USDC.</p>
        ) : null}
        {direction === 'evm_to_stellar' && amountRaw ? (
          <p className="rounded-md bg-[#FFF8D7] p-3 text-xs text-gray-700">
            {evmAllowanceLoading
              ? 'Checking USDC approval...'
              : needsEvmApproval
                ? 'Step 1 of 2: approve USDC. Once it confirms, come back here to send.'
                : 'Step 2 of 2: approval is ready. The next wallet prompt sends your USDC.'}
          </p>
        ) : null}
        <div className="rounded-md bg-[#F5FBFF] p-3 text-xs text-gray-700">
          <p>Sending from: {sourceNetwork} · {sourceWallet || 'connect wallet'}</p>
          <p>Receiving on: {destinationNetwork} · {destinationWallet || 'connect wallet'}</p>
        </div>
        <Button isDisabled={!canCreate || loading || evmChainMismatch} onPress={startEvmToStellarBridge} className="rounded-md border border-black border-b-2 bg-success text-black font-bold">
          {bridgeActionLabel}
        </Button>
      </section>

      {transfers.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-black">In progress</h3>
          {transfers.map((transfer) => {
            const progress = progressFor(transfer.status);
            return (
              <article
                key={transfer.id}
                className="w-full rounded-lg border border-black border-b-2 bg-white p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-black">{transfer.amount} USDC</p>
                    <p className="mt-1 text-xs text-gray-600">{transfer.sourceNetwork} → {transfer.destinationNetwork}</p>
                    <p className="mt-1 text-xs font-semibold text-gray-700">{progress.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isTransferInProgress(transfer.status) ? (
                        <span
                          aria-label="Transfer in progress"
                          className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-black"
                        />
                      ) : null}
                      <p className="text-xs font-bold text-black">{progress.current}/{progress.total}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-gray-600">{statusLabel[transfer.status] ?? transfer.status}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${progress.total}, minmax(0, 1fr))` }}>
                  {Array.from({ length: progress.total }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2 rounded-sm border border-black ${index < progress.current ? 'bg-primary' : 'bg-gray-100'}`}
                    />
                  ))}
                </div>
                {transfer.errorReason ? <p className="mt-2 text-xs text-danger">{transfer.errorReason}</p> : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {completedTransfers.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-black">Recent sends</h3>
          {completedTransfers.map((transfer) => (
            <article
              key={transfer.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black border-b-2 bg-white p-4 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#018222] bg-[#E9FBEF] text-[#018222]">
                  <FiCheckCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-black">{transfer.amount} USDC</p>
                  <p className="mt-1 text-xs text-gray-600">{transfer.sourceNetwork} → {transfer.destinationNetwork}</p>
                </div>
              </div>
              <p className="shrink-0 text-xs font-semibold text-[#018222]">Completed</p>
            </article>
          ))}
        </section>
      ) : null}
    </AppModal>
  );
}
