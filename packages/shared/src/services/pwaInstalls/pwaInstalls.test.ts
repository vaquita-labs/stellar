import { describe, expect, it } from 'vitest';
import {
  recordPwaInstall,
  toPwaInstallPlatform,
  type PwaInstallPlatform,
  type PwaInstallRecord,
  type PwaInstallRepository,
} from './pwaInstalls';

const FIRST = new Date('2026-09-10T12:00:00.000Z');
const LATER = new Date('2026-09-20T08:30:00.000Z');

const WALLET = 'GABC';

/** In-memory fake: the whole service is exercised without a database. */
class MemoryPwaInstallRepository implements PwaInstallRepository {
  private rows = new Map<string, PwaInstallRecord>();
  private profiles = new Map<string, number>([[WALLET, 7]]);
  private nextId = 1;

  async upsert({
    profileId,
    platform,
    userAgent,
    seenAt,
  }: {
    profileId: number;
    platform: PwaInstallPlatform;
    userAgent: string | null;
    seenAt: Date;
  }) {
    const key = `${profileId}:${platform}`;
    const existing = this.rows.get(key);
    // Mirrors the Prisma repository: an update moves `lastSeenAt` and leaves
    // `installedAt` where it was.
    const record: PwaInstallRecord = existing
      ? { ...existing, userAgent, lastSeenAt: seenAt }
      : { id: this.nextId++, profileId, platform, userAgent, installedAt: seenAt, lastSeenAt: seenAt };
    this.rows.set(key, record);
    return { record, inserted: existing == null };
  }

  async findProfileIdByWallet(walletAddress: string) {
    return this.profiles.get(walletAddress) ?? null;
  }

  get size() {
    return this.rows.size;
  }
}

describe('toPwaInstallPlatform', () => {
  it('keeps the four known platforms and collapses anything else', () => {
    expect(toPwaInstallPlatform('ios')).toBe('ios');
    expect(toPwaInstallPlatform('android')).toBe('android');
    // A value outside the set must not create a bucket nobody reads.
    expect(toPwaInstallPlatform('KaiOS')).toBe('other');
    expect(toPwaInstallPlatform(undefined)).toBe('other');
  });
});

describe('recordPwaInstall', () => {
  it('records the first launch as an install', async () => {
    const repo = new MemoryPwaInstallRepository();
    const { data, error } = await recordPwaInstall(repo, {
      walletAddress: WALLET,
      platform: 'ios',
      seenAt: FIRST,
    });

    expect(error).toBeNull();
    expect(data.inserted).toBe(true);
    expect(data.record?.installedAt).toEqual(FIRST);
  });

  it('keeps the install date when the app launches again', async () => {
    const repo = new MemoryPwaInstallRepository();
    await recordPwaInstall(repo, { walletAddress: WALLET, platform: 'ios', seenAt: FIRST });
    const { data } = await recordPwaInstall(repo, { walletAddress: WALLET, platform: 'ios', seenAt: LATER });

    // The whole point of the row: a launch is not an install, and overwriting
    // the date would say everyone installed today.
    expect(data.inserted).toBe(false);
    expect(data.record?.installedAt).toEqual(FIRST);
    expect(data.record?.lastSeenAt).toEqual(LATER);
    expect(repo.size).toBe(1);
  });

  it('counts an iPhone and an Android as two platforms for one profile', async () => {
    const repo = new MemoryPwaInstallRepository();
    await recordPwaInstall(repo, { walletAddress: WALLET, platform: 'ios', seenAt: FIRST });
    await recordPwaInstall(repo, { walletAddress: WALLET, platform: 'android', seenAt: LATER });

    expect(repo.size).toBe(2);
  });

  it('skips a wallet with no profile instead of failing', async () => {
    const repo = new MemoryPwaInstallRepository();
    // Launches happen before onboarding writes a profile; the next one records.
    const { data, error } = await recordPwaInstall(repo, { walletAddress: 'GNOBODY', platform: 'android' });

    expect(error).toBeNull();
    expect(data.record).toBeNull();
    expect(data.inserted).toBe(false);
    expect(repo.size).toBe(0);
  });

  it('truncates a user agent long enough to break the column', async () => {
    const repo = new MemoryPwaInstallRepository();
    const { data } = await recordPwaInstall(repo, {
      walletAddress: WALLET,
      platform: 'desktop',
      userAgent: 'x'.repeat(400),
    });

    // A truncated agent string is still useful; a rejected write is not.
    expect(data.record?.userAgent).toHaveLength(300);
  });

  it('returns the error instead of throwing when the write fails', async () => {
    const repo = new MemoryPwaInstallRepository();
    repo.upsert = async () => {
      throw new Error('db down');
    };

    const { data, error } = await recordPwaInstall(repo, { walletAddress: WALLET, platform: 'android' });

    expect(error?.message).toBe('db down');
    expect(data.record).toBeNull();
  });
});
