/**
 * Who is running Vaquita as an installed app.
 *
 * The point of knowing is push: on iOS a web app cannot receive a notification
 * at all until it has been added to the home screen, so the install is the gate
 * in front of the whole notification roadmap. `push_subscriptions` counts the
 * step after that one — permission granted — and counting only it made the
 * install itself invisible.
 *
 * There is nothing to ask the browser. No API answers "am I installed?": the
 * only signals are Chromium's one-shot `appinstalled` event and the fact that
 * an installed app launches in `display-mode: standalone`. iOS emits neither an
 * event nor a prompt, so standalone is its ONLY signal. A row here is therefore
 * an observation the client volunteered, not something the server witnessed,
 * and it appears on the first launch of the installed app rather than at the
 * moment of installing. On iOS those can be days apart and nothing can close
 * that gap.
 *
 * Nothing reports an uninstall either. A deleted app simply stops launching, so
 * a stale `lastSeenAt` is the only evidence there will ever be — which is why
 * this module never deletes a row and never marks one inactive.
 */

/**
 * Which kind of device holds the app.
 *
 * Coarse on purpose: the decision this feeds is "can we reach these users with
 * push, and which platform's install flow is working", and neither question
 * gets better with a browser version. Kept as a closed set with a CHECK behind
 * it so a typo cannot quietly create a bucket nobody reads.
 */
export type PwaInstallPlatform = 'android' | 'ios' | 'desktop' | 'other';

export const PWA_INSTALL_PLATFORMS: PwaInstallPlatform[] = ['android', 'ios', 'desktop', 'other'];

export interface PwaInstallRecord {
  id: number;
  profileId: number;
  platform: PwaInstallPlatform;
  userAgent: string | null;
  /** First observation for this profile and platform. Never moves. */
  installedAt: Date;
  /** Most recent launch seen from the installed app. */
  lastSeenAt: Date;
}

export interface PwaInstallRepository {
  /**
   * Record a launch: create the row on the first one, and afterwards only move
   * `lastSeenAt`.
   *
   * `installedAt` must survive the update. It is the install date, and every
   * launch overwriting it would turn the install curve into a usage curve that
   * says everyone installed today.
   */
  upsert(input: {
    profileId: number;
    platform: PwaInstallPlatform;
    userAgent: string | null;
    seenAt: Date;
  }): Promise<{ record: PwaInstallRecord; inserted: boolean }>;
  /** The profile behind a wallet, or null when the wallet never made one. */
  findProfileIdByWallet(walletAddress: string): Promise<number | null>;
}

type ServiceResult<T> = { data: T; error: Error | null };

/** Anything outside the closed set becomes `other` rather than failing a report. */
export function toPwaInstallPlatform(value: unknown): PwaInstallPlatform {
  return PWA_INSTALL_PLATFORMS.includes(value as PwaInstallPlatform) ? (value as PwaInstallPlatform) : 'other';
}

export interface RecordPwaInstallInput {
  /** Always the session's: the body never names a wallet. */
  walletAddress: string;
  platform: PwaInstallPlatform;
  userAgent?: string | null;
  /** Defaults to now — the client reports a launch that is happening. */
  seenAt?: Date;
}

export interface RecordPwaInstallResult {
  /** Null when the wallet has no profile yet, which is not an error. */
  record: PwaInstallRecord | null;
  /** True only on the first observation, so a caller can treat it as news. */
  inserted: boolean;
}

/**
 * Record one launch of the installed app.
 *
 * A wallet with no profile is skipped quietly rather than made into an error:
 * the client reports on every launch, including the ones that happen before
 * onboarding writes a profile, and a 500 there would be noise about something
 * the next launch fixes by itself.
 */
export async function recordPwaInstall(
  repository: PwaInstallRepository,
  input: RecordPwaInstallInput,
): Promise<ServiceResult<RecordPwaInstallResult>> {
  try {
    const profileId = await repository.findProfileIdByWallet(input.walletAddress);
    if (profileId == null) return { data: { record: null, inserted: false }, error: null };

    const { record, inserted } = await repository.upsert({
      profileId,
      platform: input.platform,
      // The column is varchar(300); a truncated agent string is still useful and
      // a rejected write is not.
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      seenAt: input.seenAt ?? new Date(),
    });
    return { data: { record, inserted }, error: null };
  } catch (error) {
    return { data: { record: null, inserted: false }, error: error as Error };
  }
}
