import {
  CAMPAIGN_CODE_MAX,
  CAMPAIGN_CODE_RE,
  createCampaign,
  deleteCampaign,
  isCampaignCodeTaken,
  listCampaigns,
  updateCampaign,
} from '@vaquita/shared/services/campaign/index';
import type { Campaign } from '@vaquita/db';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSecretOk } from '@/lib/adminSecret';

// Marketing campaigns: the codes and default UTM parameters the attribution
// endpoint resolves against. Same runtime/auth conventions as the rewards route.
export const runtime = 'nodejs';
// Campaign state changes whenever marketing touches it — never cached.
export const dynamic = 'force-dynamic';

const forbidden = () => NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 });
const invalidJson = () => NextResponse.json({ status: 'error', message: 'Invalid JSON body' }, { status: 400 });

// Uppercased before validation so marketing can type either case; the
// resolution path only ever compares uppercase.
const codeSchema = z
  .string()
  .trim()
  .max(CAMPAIGN_CODE_MAX)
  .transform((v) => v.toUpperCase())
  .refine((v) => CAMPAIGN_CODE_RE.test(v), {
    message: 'Use 2–32 characters: A–Z, 0–9, dash or underscore, starting with a letter or digit.',
  });

const nullableStr = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null));

// Dates arrive as ISO strings from <input type="datetime-local"> or empty.
const nullableDate = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), { message: 'Invalid date' });

const campaignFields = {
  name: z.string().trim().min(1).max(120),
  source: nullableStr(60),
  medium: nullableStr(60),
  content: nullableStr(120),
  landingPath: nullableStr(200),
  startsAt: nullableDate,
  endsAt: nullableDate,
  isActive: z.boolean().optional(),
  notes: nullableStr(2000),
};

const createSchema = z.object({ code: codeSchema, ...campaignFields });
const updateSchema = z.object({ id: z.number().int().positive(), code: codeSchema, ...campaignFields });

const serializeCampaign = (campaign: Campaign) => ({
  ...campaign,
  startsAt: campaign.startsAt?.toISOString() ?? null,
  endsAt: campaign.endsAt?.toISOString() ?? null,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt.toISOString(),
  deletedAt: campaign.deletedAt?.toISOString() ?? null,
});

const badPayload = (details: unknown) =>
  NextResponse.json({ status: 'error', message: 'Invalid campaign payload', details }, { status: 400 });

// GET /api/admin/campaigns — every live campaign, newest first.
export async function GET(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();
  const campaigns = await listCampaigns();
  return NextResponse.json({ data: { campaigns: campaigns.map(serializeCampaign) } });
}

// POST /api/admin/campaigns — create.
export async function POST(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badPayload(parsed.error.flatten());

  // The check that actually matters: campaign codes and user referral codes
  // share one resolution path, so a collision would quietly route someone's
  // personal invites into this campaign's bucket.
  if (await isCampaignCodeTaken(parsed.data.code)) {
    return NextResponse.json({ status: 'error', message: 'That code is already in use.' }, { status: 409 });
  }

  const campaign = await createCampaign(parsed.data);
  return NextResponse.json({ data: { campaign: serializeCampaign(campaign) } });
}

// PATCH /api/admin/campaigns — update (id in the body).
export async function PATCH(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badPayload(parsed.error.flatten());

  const { id, ...data } = parsed.data;
  if (await isCampaignCodeTaken(data.code, id)) {
    return NextResponse.json({ status: 'error', message: 'That code is already in use.' }, { status: 409 });
  }

  const campaign = await updateCampaign(id, data);
  if (!campaign) {
    return NextResponse.json({ status: 'error', message: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { campaign: serializeCampaign(campaign) } });
}

// DELETE /api/admin/campaigns?id=123 — soft-delete. Profiles already attributed
// keep pointing at the row, so retiring a campaign never rewrites history.
export async function DELETE(req: NextRequest) {
  if (!adminSecretOk(req)) return forbidden();

  const idParam = req.nextUrl.searchParams.get('id');
  const id = Number(idParam);
  if (!idParam || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ status: 'error', message: 'Valid id query param required' }, { status: 400 });
  }

  if (!(await deleteCampaign(id))) {
    return NextResponse.json({ status: 'error', message: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json({ data: { id } });
}
