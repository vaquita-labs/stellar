import { z } from 'zod';

export const depositSchema = z.object({
  networkName: z.string().min(1),
  walletAddress: z.string().min(1),
  amount: z.number().positive(),
  tokenSymbol: z.string().min(1),
  lockPeriod: z.number().positive(),
  vaquitaContract: z.string().min(1),
});
