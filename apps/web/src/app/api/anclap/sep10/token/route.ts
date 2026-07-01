import { postToken } from '@/networks/anclap/anclap';
import { reply, badRequest } from '@/networks/anclap/proxy';

// SEP-10 — POST /api/anclap/sep10/token { transaction } (XDR ya firmado por la wallet)
// -> POST /auth  ->  { token: <JWT> }
export async function POST(req: Request) {
  const { transaction } = await req.json().catch(() => ({}));
  if (typeof transaction !== 'string' || !transaction) {
    return badRequest("Falta 'transaction' (XDR firmado).");
  }
  return reply(await postToken(transaction));
}
