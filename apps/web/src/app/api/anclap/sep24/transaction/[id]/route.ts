import { getTransaction } from '@/networks/anclap/anclap';
import { reply, badRequest, jwtFrom } from '@/networks/anclap/proxy';

// SEP-24 — GET /api/anclap/sep24/transaction/{id} + Bearer JWT
// -> GET /transfer24/transaction?id={id}
// Next 16: los params dinámicos llegan como Promise.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const jwt = jwtFrom(req);
  if (!jwt) return badRequest('Falta el JWT (header Authorization: Bearer ...).');

  const { id } = await ctx.params;
  if (!id) return badRequest('Falta el id de transacción.');

  return reply(await getTransaction(id, jwt));
}
