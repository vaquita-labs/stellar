import type { UpstreamResult } from './anclap';

// Convierte el resultado upstream de Anclap en una Response de Next, espejando
// el status real y exponiendo la URL de Anclap en una cabecera para la UI.
// Portado del POC tmp/poc-anclap/lib/proxy.ts.
export function reply(r: UpstreamResult): Response {
  return Response.json(r, {
    status: r.status >= 200 && r.status < 600 ? r.status : 502,
    headers: { 'x-anclap-url': r.url },
  });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

// Lee el JWT del header Authorization (Bearer ...) que manda el cliente.
export function jwtFrom(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
