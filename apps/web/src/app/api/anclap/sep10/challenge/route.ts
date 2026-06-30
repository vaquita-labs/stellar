import { getChallenge } from '@/networks/anclap/anclap';
import { reply, badRequest } from '@/networks/anclap/proxy';

// SEP-10 — GET /api/anclap/sep10/challenge?account=G... -> GET /auth?account=G...
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get('account');
  if (!account) return badRequest("Falta el parámetro 'account'.");
  return reply(await getChallenge(account));
}
