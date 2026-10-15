import { prisma } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminRequestOk, forbidden, requireOperator } from '@/lib/adminSecret';
import { audited } from '@/lib/audit';

// Admin API for `admin_users`: who may write in this console.
//
// Entry is Cloudflare Access's job; this table only assigns operator or
// read-only to an admitted email and lets one person be disabled alone.
// While the table is empty every admitted email is an operator (bootstrap),
// so the first POST here is normally someone adding themselves.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const email = z.string().trim().toLowerCase().email().max(254);
const role = z.enum(['operator', 'read-only']);

const createSchema = z.object({ email, role });
const updateSchema = z.object({ email, role: role.optional(), disabled: z.boolean().optional() });

const invalid = (message: string) => NextResponse.json({ status: 'error', message }, { status: 400 });

// GET /api/admin/users — every row, operators first.
export async function GET(req: NextRequest) {
  if (!(await adminRequestOk(req))) return forbidden();
  const users = await prisma.adminUser.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }] });
  return NextResponse.json({ data: { users } });
}

// POST /api/admin/users — add an email with a role.
async function POSTHandler(req: NextRequest) {
  const actor = await requireOperator(req);
  if (!actor) return forbidden();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message).join('; '));

  const existing = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ status: 'error', message: 'Already listed' }, { status: 409 });

  const user = await prisma.adminUser.create({ data: { ...parsed.data, createdBy: actor.email } });
  return NextResponse.json({ data: { user } }, { status: 201 });
}

// PATCH /api/admin/users — change a role, or disable / re-enable.
//
// An operator cannot disable or demote themselves: with no other operator
// left, nobody could undo it. Bootstrap would not help either, since the
// table is no longer empty.
async function PATCHHandler(req: NextRequest) {
  const actor = await requireOperator(req);
  if (!actor) return forbidden();

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.issues.map((i) => i.message).join('; '));
  const { email: target, role: newRole, disabled } = parsed.data;

  const losesPower = disabled === true || newRole === 'read-only';
  if (target === actor.email && losesPower) return invalid('You cannot remove your own operator access');

  const user = await prisma.adminUser.update({
    where: { email: target },
    data: {
      ...(newRole ? { role: newRole } : {}),
      ...(disabled === undefined ? {} : { disabledAt: disabled ? new Date() : null }),
    },
  });
  return NextResponse.json({ data: { user } });
}

export const POST = audited('users.create', POSTHandler);
export const PATCH = audited('users.update', PATCHHandler);
