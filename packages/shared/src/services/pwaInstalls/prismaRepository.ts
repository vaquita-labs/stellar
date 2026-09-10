import { prisma } from '@vaquita/db';
import type { PwaInstallPlatform, PwaInstallRecord, PwaInstallRepository } from './pwaInstalls';

const toRecord = (row: {
  id: number;
  profileId: number;
  platform: string;
  userAgent: string | null;
  installedAt: Date;
  lastSeenAt: Date;
}): PwaInstallRecord => ({
  id: row.id,
  profileId: row.profileId,
  platform: row.platform as PwaInstallPlatform,
  userAgent: row.userAgent,
  installedAt: row.installedAt,
  lastSeenAt: row.lastSeenAt,
});

export const prismaPwaInstallRepository: PwaInstallRepository = {
  async upsert({ profileId, platform, userAgent, seenAt }) {
    // Read first so the caller can tell a new install from a returning launch.
    // The unique index still decides the write, so a race ends with one row —
    // the loser just reports `inserted: false`, which is the truthful answer
    // for the second of two simultaneous launches anyway.
    const existing = await prisma.pwaInstall.findUnique({
      where: { profileId_platform: { profileId, platform } },
      select: { id: true },
    });

    const row = await prisma.pwaInstall.upsert({
      where: { profileId_platform: { profileId, platform } },
      // `installedAt` is deliberately absent: it is the install date and a
      // launch is not an install.
      update: { lastSeenAt: seenAt, userAgent },
      create: { profileId, platform, userAgent, installedAt: seenAt, lastSeenAt: seenAt },
    });

    return { record: toRecord(row), inserted: existing == null };
  },

  async findProfileIdByWallet(walletAddress) {
    const profile = await prisma.profile.findUnique({
      where: { walletAddress },
      select: { id: true },
    });
    return profile?.id ?? null;
  },
};
