import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { type AdminActor, forbidden, requireOperator } from './adminSecret';

// Every admin write leaves a row in admin_audit_log: who, what, to which
// target, with which payload, from where.
//
// `audited(action, handler)` wraps a route handler. It refuses anyone who is
// not an operator, runs the handler, and when the response is 2xx records the
// row. The payload is the request's JSON body as sent (a clone is read in
// parallel so the handler still gets its own stream), with secret-looking keys
// blanked; a body that is not JSON records null. The target is the `[id]` or
// `[key]` route segment, or the `id` query parameter, which is how every
// collection route here names the row it touches.
//
// Logging after the handler rather than before means a refused or failed write
// leaves no row, so the log reads as "what changed", not "what was attempted".
// The write itself is awaited: if the log cannot be written the response still
// goes out, with the failure in the server log, because losing an audit row is
// a reporting problem and blocking the admin on it would hide a worse one.

type RouteContext = { params?: Promise<Record<string, unknown>> };
type Handler<C extends RouteContext> = (req: NextRequest, ctx: C) => Promise<Response | NextResponse>;

const SECRET_KEY = /secret|password|token|seed|private|credential/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '<redacted>' : redact(v, depth + 1)]),
  );
}

async function targetOf(req: NextRequest, ctx: RouteContext): Promise<string | null> {
  const params = ctx.params ? await ctx.params : undefined;
  const fromRoute = params ? Object.values(params).flat()[0] : undefined;
  const fromQuery = req.nextUrl.searchParams.get('id');
  const target = fromRoute ?? fromQuery ?? null;
  return target ? String(target).slice(0, 128) : null;
}

function clientAddress(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

export async function audit(input: {
  actor: AdminActor;
  action: string;
  target: string | null;
  payload: unknown;
  ip: string | null;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorEmail: input.actor.email,
        action: input.action,
        target: input.target,
        payload: input.payload === undefined ? undefined : (redact(input.payload) as object),
        ip: input.ip,
      },
    });
  } catch (error) {
    console.error('[audit] could not write admin_audit_log', { action: input.action, error });
  }
}

export function audited<C extends RouteContext>(action: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const actor = await requireOperator(req);
    if (!actor) return forbidden();

    // Read the body from a clone, in parallel, so the handler's own read is unaffected.
    const payload = req
      .clone()
      .json()
      .catch(() => null);

    const res = await handler(req, ctx);
    if (res.ok) {
      await audit({ actor, action, target: await targetOf(req, ctx), payload: await payload, ip: clientAddress(req) });
    }
    return res;
  };
}
