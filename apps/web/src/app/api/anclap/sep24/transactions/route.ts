import { getTransactions } from '@/networks/anclap/anclap';
import { reply, badRequest, jwtFrom } from '@/networks/anclap/proxy';

// SEP-24 — GET /api/anclap/sep24/transactions?asset_code=ARS + Bearer JWT
// -> GET /transfer24/transactions?asset_code=ARS
export async function GET(req: Request) {
  const jwt = jwtFrom(req);
  if (!jwt) return badRequest('Falta el JWT (header Authorization: Bearer ...).');

  const assetCode = new URL(req.url).searchParams.get('asset_code') ?? 'ARS';

  return reply(await getTransactions(assetCode, jwt));
}
