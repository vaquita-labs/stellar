import {
  SUPPORT_MESSAGE_MAX,
  createTeamSupportMessage,
  getSupportConversation,
  setSupportConversationResolved,
} from '@vaquita/shared/services/support/index';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';

// One thread of the private Help Center chat: read it, reply to it, resolve it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
const notFound = () => NextResponse.json({ status: 'error', message: 'Conversation not found' }, { status: 404 });

const idSchema = z.string().uuid();
const replySchema = z.object({ body: z.string().trim().min(1).max(SUPPORT_MESSAGE_MAX) });
const resolveSchema = z.object({ resolved: z.boolean() });

const readJson = async (req: NextRequest): Promise<unknown> => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

// GET /api/admin/support/:id — the thread, oldest message first.
export async function GET(req: NextRequest, { params }: Params) {
  if (!(await adminSecretOk(req))) return forbidden();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const conversation = await getSupportConversation(id);
  if (!conversation) return notFound();
  return NextResponse.json({ data: { conversation } });
}

// POST /api/admin/support/:id  { body } — a reply from the team.
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await adminSecretOk(req))) return forbidden();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const parsed = replySchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: `A reply of 1 to ${SUPPORT_MESSAGE_MAX} characters is required` },
      { status: 400 }
    );
  }

  const message = await createTeamSupportMessage(id, parsed.data.body);
  if (!message) return notFound();
  return NextResponse.json({ data: { message } });
}

// PATCH /api/admin/support/:id  { resolved } — resolve or reopen.
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await adminSecretOk(req))) return forbidden();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return notFound();

  const parsed = resolveSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ status: 'error', message: '`resolved` must be a boolean' }, { status: 400 });
  }

  if (!(await setSupportConversationResolved(id, parsed.data.resolved))) return notFound();
  return NextResponse.json({ data: { id, resolved: parsed.data.resolved } });
}
