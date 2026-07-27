import { z } from 'zod';

export const depositSchema = z.object({
  networkName: z.string().min(1),
  walletAddress: z.string().min(1),
  amount: z.number().positive(),
  tokenSymbol: z.string().min(1),
  lockPeriod: z.number().positive(),
  vaquitaContract: z.string().min(1),
  // Client-supplied per-wallet nonce (u64 as string) the position id is derived
  // from. Optional for backward compatibility; the new UI supplies it.
  nonce: z.string().min(1).optional(),
});
