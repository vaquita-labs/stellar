'use client';

import { Button, toast } from '@heroui/react';
import {
  buildErc20AllowanceCall,
  buildErc20ApproveTx,
  buildEvmToStellarBurnTx,
} from '@/networks/evm/cctp';
import { useEffect, useMemo, useState } from 'react';
import { FiRefreshCcw } from 'react-icons/fi';
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
  source_awaiting_signature: 'Waiting for source transaction',
  source_confirming: 'Confirming source transaction',
  attestation_pending: 'Waiting for Circle attestation',
  ready_to_complete: 'Ready to complete',
  destination_awaiting_signature: 'Waiting for destination transaction',
  destination_confirming: 'Confirming destination transaction',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  needs_review: 'Needs review',
};

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
  const { listTransfers, createTransfer, attachSourceTx, refreshTransfer, attachDestinationTx } = useBridgeTransfers();
  const [direction, setDirection] = useState<BridgeDirection>('evm_to_stellar');
  const [evmNetwork, setEvmNetwork] = useState<BridgeNetworkKey>('ethereum-sepolia');
  const [evmWallet, setEvmWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [sourceTxHash, setSourceTxHash] = useState('');
  const [destinationTxHash, setDestinationTxHash] = useState('');
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<BridgeTransfer[]>([]);
  const [evmUsdcBalanceRaw, setEvmUsdcBalanceRaw] = useState<bigint | null>(null);
  const [evmBalanceError, setEvmBalanceError] = useState('');
  const [evmChainMismatch, setEvmChainMismatch] = useState(false);
  const [evmBalanceLoading, setEvmBalanceLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId) ?? null;
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
  const currentWallets = useMemo(
    () => [stellarWallet, evmWallet].filter(Boolean),
    [stellarWallet, evmWallet],
  );

  const reload = async () => {
    const lists = await Promise.all(currentWallets.map((wallet) => listTransfers(wallet)));
    const byId = new Map<string, BridgeTransfer>();
    lists.flat().forEach((transfer) => byId.set(transfer.id, transfer));
    setTransfers([...byId.values()]);
  };

  useEffect(() => {
    if (!open || currentWallets.length === 0) return;
    void reload().catch((error) => console.warn('[bridge] list failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentWallets.join('|')]);

  const connectEvm = async () => {
    if (!window.ethereum) {
      toast.danger(t('wallet.bridge.noInjectedWallet', 'No injected EVM wallet found'));
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
        setEvmBalanceError(`Switch wallet network to ${selectedEvmLabel} (${chain.chainIdHex}); wallet reports ${currentChainId}`);
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
      setEvmBalanceError(error instanceof Error ? error.message : 'Could not read USDC balance');
    } finally {
      setEvmBalanceLoading(false);
    }
  };

  const switchEvmNetwork = async () => {
    if (!window.ethereum) {
      toast.danger(t('wallet.bridge.noInjectedWallet', 'No injected EVM wallet found'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evmWallet, evmNetwork]);

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
      const transfer = await createDraftTransfer();
      setSelectedTransferId(transfer.id);
      return;
    }
    const transfer = await createDraftTransfer();
    setSelectedTransferId(transfer.id);
    await signEvmSourceBurnFor(transfer);
  });

  const signEvmSourceBurnFor = async (transfer: BridgeTransfer) => {
    if (!window.ethereum) throw new Error('No injected EVM wallet found');
    if (transfer.direction !== 'evm_to_stellar') {
      throw new Error('Live EVM source signing is only available for EVM to Stellar transfers');
    }
    if (transfer.status !== 'source_awaiting_signature') {
      throw new Error('Source transaction is already attached or no longer awaiting signature');
    }
    if (transfer.sourceWallet.toLowerCase() !== evmWallet.toLowerCase()) {
      throw new Error('Connected EVM wallet does not match the transfer source wallet');
    }

    const chain = evmChainConfig[transfer.sourceNetwork];
    if (!chain) throw new Error(`Unsupported EVM network: ${transfer.sourceNetwork}`);
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
    if (!chainIdsMatch(currentChainId, chain.chainIdHex)) {
      throw new Error(`Switch wallet network to ${transfer.sourceNetwork} (${chain.chainIdHex}); wallet reports ${currentChainId}`);
    }

    const amountRaw = BigInt(transfer.amountRaw);
    const allowanceCall = buildErc20AllowanceCall(transfer.sourceNetwork, transfer.sourceWallet);
    const allowance = hexToBigInt(await window.ethereum.request({
      method: 'eth_call',
      params: [
        {
          from: transfer.sourceWallet,
          to: allowanceCall.to,
          data: allowanceCall.data,
        },
        'latest',
      ],
    }));

    if (allowance < amountRaw) {
      const approval = buildErc20ApproveTx(transfer.sourceNetwork, amountRaw);
      await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: transfer.sourceWallet,
          to: approval.to,
          data: approval.data,
        }],
      });
    }

    const burn = buildEvmToStellarBurnTx({
      sourceNetwork: transfer.sourceNetwork,
      destinationNetwork: transfer.destinationNetwork,
      amount: amountRaw,
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

  const attachSource = () => selectedTransfer && runAction(async () => {
    await attachSourceTx(selectedTransfer.id, { sourceTxHash });
    setSourceTxHash('');
  });

  const signEvmSourceBurn = () => selectedTransfer && runAction(async () => {
    await signEvmSourceBurnFor(selectedTransfer);
  });

  const refresh = (transfer: BridgeTransfer) => runAction(async () => {
    const updated = await refreshTransfer(transfer.id);
    setSelectedTransferId(updated.id);
  });

  const attachDestination = () => selectedTransfer && runAction(async () => {
    await attachDestinationTx(selectedTransfer.id, destinationTxHash);
    setDestinationTxHash('');
  });

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.bridge.title', 'Bridge USDC')}
      size="lg"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      <section className="flex flex-col gap-3 rounded-lg border border-black border-b-2 bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className={`rounded-md border border-black border-b-2 ${direction === 'evm_to_stellar' ? 'bg-primary' : 'bg-white'} text-black`}
            onPress={() => setDirection('evm_to_stellar')}
          >
            EVM → Stellar
          </Button>
          <Button
            className={`rounded-md border border-black border-b-2 ${direction === 'stellar_to_evm' ? 'bg-primary' : 'bg-white'} text-black`}
            onPress={() => setDirection('stellar_to_evm')}
          >
            Stellar → EVM
          </Button>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-black">
          EVM chain
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
            EVM wallet
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
              ? `Checking ${selectedEvmLabel} USDC balance...`
              : evmBalanceError
                ? evmBalanceError
                : evmUsdcBalanceRaw !== null
                  ? `${selectedEvmLabel} USDC balance: ${rawUsdcToHuman(evmUsdcBalanceRaw)} USDC`
                  : 'Connect an EVM wallet to check USDC balance'}
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
            <button
              type="button"
              onClick={refreshEvmUsdcBalance}
              disabled={!evmWallet || evmBalanceLoading}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
        {!hasEnoughEvmUsdc ? (
          <p className="text-xs font-semibold text-danger">Amount exceeds the selected EVM wallet USDC balance.</p>
        ) : null}
        <div className="rounded-md bg-[#F5FBFF] p-3 text-xs text-gray-700">
          <p>Source: {sourceNetwork} · {sourceWallet || 'connect wallet'}</p>
          <p>Destination: {destinationNetwork} · {destinationWallet || 'connect wallet'}</p>
        </div>
        <Button isDisabled={!canCreate || loading || evmChainMismatch} onPress={startEvmToStellarBridge} className="rounded-md border border-black border-b-2 bg-success text-black font-bold">
          {direction === 'evm_to_stellar' ? 'Approve and burn source USDC' : 'Create resumable transfer'}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-black">Active transfers</h3>
          <Button
            size="sm"
            isDisabled={loading}
            onPress={() => runAction(reload)}
            className="rounded-md border border-black border-b-2 bg-white text-black"
          >
            <FiRefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        {transfers.length === 0 ? (
          <p className="rounded-lg border border-black border-b-2 bg-white p-4 text-sm text-gray-600">
            No active bridge transfers yet.
          </p>
        ) : (
          transfers.map((transfer) => (
            <button
              type="button"
              key={transfer.id}
              onClick={() => setSelectedTransferId(transfer.id)}
              className={`w-full rounded-lg border border-black border-b-2 bg-white p-4 text-left text-sm transition ${selectedTransferId === transfer.id ? 'ring-2 ring-primary' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-black">{transfer.amount} USDC</span>
                <span className="text-xs font-semibold text-gray-600">{statusLabel[transfer.status] ?? transfer.status}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{transfer.sourceNetwork} → {transfer.destinationNetwork}</p>
            </button>
          ))
        )}
      </section>

      {selectedTransfer ? (
        <section className="flex flex-col gap-3 rounded-lg border border-black border-b-2 bg-white p-4">
          <h3 className="text-sm font-bold text-black">Resume selected transfer</h3>
          {selectedTransfer.direction === 'evm_to_stellar' && selectedTransfer.status === 'source_awaiting_signature' ? (
            <div className="flex flex-col gap-2 rounded-md bg-[#FFF8D7] p-3 text-xs text-gray-700">
              <p>
                This signs live EVM transactions. Your wallet may first ask to approve USDC, then ask to burn through CCTP.
                You will need source-chain gas, and Stellar completion happens after Circle attestation is ready.
              </p>
              <Button isDisabled={loading || !evmWallet} onPress={signEvmSourceBurn} className="rounded-md border border-black border-b-2 bg-primary text-black font-bold">
                Approve and burn source USDC
              </Button>
            </div>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-semibold text-black">
            Source transaction hash
            <input
              value={sourceTxHash}
              onChange={(event) => setSourceTxHash(event.target.value)}
              className="h-11 rounded-md border border-black border-b-2 bg-white px-3 text-sm font-normal"
            />
          </label>
          <Button isDisabled={!sourceTxHash || loading} onPress={attachSource} className="rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black">
            Attach source tx
          </Button>
          <Button isDisabled={loading} onPress={() => refresh(selectedTransfer)} className="rounded-md border border-black border-b-2 bg-white text-black">
            Refresh attestation
          </Button>
          {selectedTransfer.status === 'ready_to_complete' ? (
            <>
              {selectedTransfer.direction === 'evm_to_stellar' ? (
                <div className="flex flex-col gap-2 rounded-md bg-[#E9FBEF] p-3 text-xs text-gray-700">
                  <p>
                    Circle attestation is ready. Vaquita will relay the Stellar receive step and forward USDC to the destination wallet without another wallet prompt.
                  </p>
                  <Button isDisabled={loading} onPress={() => refresh(selectedTransfer)} className="rounded-md border border-black border-b-2 bg-success text-black font-bold">
                    Refresh relay status
                  </Button>
                </div>
              ) : null}
              <label className="flex flex-col gap-1 text-sm font-semibold text-black">
                Destination transaction hash
                <input
                  value={destinationTxHash}
                  onChange={(event) => setDestinationTxHash(event.target.value)}
                  className="h-11 rounded-md border border-black border-b-2 bg-white px-3 text-sm font-normal"
                />
              </label>
              <Button isDisabled={!destinationTxHash || loading} onPress={attachDestination} className="rounded-md border border-black border-b-2 bg-success text-black">
                Mark destination complete
              </Button>
            </>
          ) : null}
          {selectedTransfer.errorReason ? <p className="text-xs text-danger">{selectedTransfer.errorReason}</p> : null}
        </section>
      ) : null}
    </AppModal>
  );
}
