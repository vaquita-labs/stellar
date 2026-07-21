import { prisma } from '@vaquita/db';
import { contractBadgeTypeOf, contractOwnerOf } from './contract';

// ---------------------------------------------------------------------------
// Badge catalog
// ---------------------------------------------------------------------------

export type BadgeCategory = 'A' | 'B' | 'C' | 'D';

interface BadgeMeta {
  name: string;
  description: string;
  imageFile: string;
  category: BadgeCategory;
  rarity: string;
  tier?: string;
  rank?: number;
  milestone?: string;
  unlocked?: string;
  edition?: string;
  maxMint?: number;
}

const CDN = 'https://vaquita.fi/assets/badges';

const BADGE_CATALOG: Record<string, BadgeMeta> = {
  'first-place': {
    name: 'Vaquero de Oro',
    description: 'Awarded to the #1 ranked saver of the month on Vaquita. Soulbound — cannot be transferred.',
    imageFile: 'first-place.png',
    category: 'A',
    rarity: 'Legendary',
    tier: 'Gold',
    rank: 1,
  },
  'second-place': {
    name: 'Vaquero de Plata',
    description: 'Awarded to the #2 ranked saver of the month on Vaquita. Soulbound — cannot be transferred.',
    imageFile: 'second-place.png',
    category: 'A',
    rarity: 'Epic',
    tier: 'Silver',
    rank: 2,
  },
  'third-place': {
    name: 'Vaquero de Bronce',
    description: 'Awarded to the #3 ranked saver of the month on Vaquita. Soulbound — cannot be transferred.',
    imageFile: 'third-place.png',
    category: 'A',
    rarity: 'Rare',
    tier: 'Bronze',
    rank: 3,
  },
  top10: {
    name: 'Top 10 Contributor',
    description: 'Awarded to wallets finishing in the top 10 of the monthly Vaquita leaderboard. Soulbound — cannot be transferred.',
    imageFile: 'month-master.png',
    category: 'B',
    rarity: 'Uncommon',
    tier: 'Contributor',
  },
  primera_vaquita: {
    name: 'Primera Vaquita',
    description: 'Awarded for completing a first full savings cycle on Vaquita. Soulbound — cannot be transferred.',
    imageFile: 'first-deposit.png',
    category: 'C',
    rarity: 'Common',
    milestone: 'Primera Vaquita',
    unlocked: 'Completed first savings cycle',
  },
  maratonista: {
    name: 'Maratonista',
    description: 'Awarded for completing a 6-month savings cycle without early withdrawal. Soulbound — cannot be transferred.',
    imageFile: 'century-saver.png',
    category: 'C',
    rarity: 'Rare',
    milestone: 'Maratonista',
    unlocked: 'Completed first 6-month cycle',
  },
  trimestral: {
    name: 'Trimestral',
    description: 'Awarded for completing a 3-month savings cycle without early withdrawal. Soulbound — cannot be transferred.',
    imageFile: 'trio-saver.png',
    category: 'C',
    rarity: 'Uncommon',
    milestone: 'Trimestral',
    unlocked: 'Completed first 3-month cycle',
  },
  disciplinado: {
    name: 'Disciplinado',
    description: 'Awarded for 30 consecutive days of savings activity on Vaquita. Soulbound — cannot be transferred.',
    imageFile: 'streak-master.png',
    category: 'C',
    rarity: 'Rare',
    milestone: 'Disciplinado',
    unlocked: '30 consecutive days of activity',
  },
  veterano: {
    name: 'Veterano',
    description: 'Awarded for completing 12 savings cycles without early withdrawal. Soulbound — cannot be transferred.',
    imageFile: 'savings-baron.png',
    category: 'C',
    rarity: 'Epic',
    milestone: 'Veterano',
    unlocked: '12 cycles completed without penalty',
  },
  genesis_saver: {
    name: 'Genesis Saver',
    description: 'One of the first 50 wallets to deposit on Vaquita beta. Soulbound — cannot be transferred.',
    imageFile: 'beta-tester2.png',
    category: 'D',
    rarity: 'Legendary',
    edition: 'Genesis Saver',
    maxMint: 50,
  },
  mainnet_pioneer: {
    name: 'Mainnet Pioneer',
    description: 'Made a first deposit on Vaquita mainnet within the first 7 days of launch. Soulbound — cannot be transferred.',
    imageFile: 'explorer.png',
    category: 'D',
    rarity: 'Epic',
    edition: 'Mainnet Pioneer',
  },
  hackathon_champion: {
    name: 'Hackathon Champion',
    description: 'Awarded to participants of a Vaquita hackathon event. Soulbound — cannot be transferred.',
    imageFile: 'whale.png',
    category: 'D',
    rarity: 'Epic',
    edition: 'Hackathon Champion',
  },
};

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

type Attribute = { trait_type: string; value: string | number | boolean };

async function resolveAttributes(
  meta: BadgeMeta,
  badgeType: string,
  owner: string,
): Promise<Attribute[]> {
  const base: Attribute[] = [
    { trait_type: 'Category', value: categoryLabel(meta.category) },
    { trait_type: 'Rarity', value: meta.rarity },
    { trait_type: 'Soulbound', value: true },
  ];

  if (meta.category === 'A' || meta.category === 'B') {
    if (meta.tier) base.push({ trait_type: 'Tier', value: meta.tier });
    if (meta.rank != null) base.push({ trait_type: 'Rank', value: meta.rank });

    const cycleId = await lookupCycleId(owner, badgeType);
    base.push({ trait_type: 'Cycle', value: cycleId ?? 'N/A' });
    base.push({ trait_type: 'Score', value: 'N/A' });
  }

  if (meta.category === 'C') {
    if (meta.milestone) base.push({ trait_type: 'Milestone', value: meta.milestone });
    if (meta.unlocked) base.push({ trait_type: 'Unlocked', value: meta.unlocked });
  }

  if (meta.category === 'D') {
    if (meta.edition) base.push({ trait_type: 'Edition', value: meta.edition });
    const serial = await lookupEditionSerial(owner, badgeType);
    base.push({ trait_type: 'Serial', value: serial ?? 'N/A' });
    if (meta.maxMint != null) base.push({ trait_type: 'Max Mint', value: meta.maxMint });
    base.push({ trait_type: 'Network', value: process.env.STELLAR_NETWORK ?? 'Testnet' });
  }

  return base;
}

function categoryLabel(cat: BadgeCategory): string {
  switch (cat) {
    case 'A': return 'Monthly Podium';
    case 'B': return 'Top Contributor';
    case 'C': return 'Personal Milestone';
    case 'D': return 'Limited Edition';
  }
}

async function lookupCycleId(wallet: string, badgeType: string): Promise<string | null> {
  const claim = await prisma.badgeClaim.findFirst({
    where: { walletAddress: wallet, badgeType },
    orderBy: { createdAt: 'desc' },
    select: { cycleId: true },
  });
  if (!claim) return null;
  return claim.cycleId ? String(claim.cycleId) : null;
}

async function lookupEditionSerial(wallet: string, badgeType: string): Promise<number | null> {
  // Serial = position of this wallet's claim by created_at within this edition
  const rows = await prisma.badgeClaim.findMany({
    where: { badgeType },
    orderBy: { createdAt: 'asc' },
    select: { walletAddress: true },
  });
  const idx = rows.findIndex((r) => r.walletAddress === wallet);
  return idx >= 0 ? idx + 1 : null;
}

// ---------------------------------------------------------------------------
// Public: build NFT metadata JSON
// ---------------------------------------------------------------------------

export interface BadgeMetadata {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  external_url: string;
  attributes: Attribute[];
  properties: {
    badge_type: string;
    category: BadgeCategory;
    owner: string;
  };
}

export async function getBadgeMetadata(
  badgeContractId: string,
  tokenId: number,
): Promise<BadgeMetadata | null> {
  const [owner, badgeType] = await Promise.all([
    contractOwnerOf(badgeContractId, tokenId),
    contractBadgeTypeOf(badgeContractId, tokenId),
  ]);

  if (!owner || !badgeType) return null;

  const meta = BADGE_CATALOG[badgeType];
  if (!meta) return null;

  const attributes = await resolveAttributes(meta, badgeType, owner);

  return {
    name: meta.name,
    description: meta.description,
    image: `${CDN}/${meta.imageFile}`,
    animation_url: `${CDN}/${meta.imageFile.replace('.png', '.glb')}`,
    external_url: `https://vaquita.fi/badge/${tokenId}`,
    attributes,
    properties: {
      badge_type: badgeType,
      category: meta.category,
      owner,
    },
  };
}
