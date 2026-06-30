import { z } from 'zod';

export const bridgeCreateSchema = z.object({
  direction: z.enum(['evm_to_stellar', 'stellar_to_evm']),
  sourceNetwork: z.enum(['ethereum', 'ethereum-sepolia', 'base', 'base-sepolia', 'stellar', 'stellar-testnet']),
  destinationNetwork: z.enum(['ethereum', 'ethereum-sepolia', 'base', 'base-sepolia', 'stellar', 'stellar-testnet']),
  sourceWallet: z.string().min(1),
  destinationWallet: z.string().min(1),
  amount: z.string().min(1),
});

export const bridgeSourceTxSchema = z.object({
  sourceTxHash: z.string().min(1),
  messageHash: z.string().min(1).optional().nullable(),
});

export const bridgeDestinationTxSchema = z.object({
  destinationTxHash: z.string().min(1),
});

export const bridgeListQuerySchema = z.object({
  wallet: z.string().min(1),
});
