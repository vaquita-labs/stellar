import { postInteractive } from '@/networks/anclap/anclap';
import { reply, badRequest, jwtFrom } from '@/networks/anclap/proxy';

// SEP-24 — POST /api/anclap/sep24/withdraw { asset_code, account, amount } + Bearer JWT
// -> POST /transfer24/transactions/withdraw/interactive
export async function POST(req: Request) {
  const jwt = jwtFrom(req);
  if (!jwt) return badRequest('Falta el JWT (header Authorization: Bearer ...).');

  const { asset_code, account, amount } = await req.json().catch(() => ({}));
  if (!asset_code || !account) {
    return badRequest("Faltan 'asset_code' y/o 'account'.");
  }

  const payload: { asset_code: string; account: string; amount?: string } = { asset_code, account };
  if (amount) payload.amount = String(amount);

  return reply(await postInteractive('withdraw', jwt, payload));
}
