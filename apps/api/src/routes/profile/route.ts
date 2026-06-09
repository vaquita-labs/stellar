import { Router } from 'express';
import multer from 'multer';
import { v4 } from 'uuid';
import { isStorageConfigured, putAvatar, removeAvatar } from '../../lib/storage';
import {
  broadcastProfileChange,
  getAchievementCountsByProfile,
  getActiveDepositSumsByWallet,
  getExperienceByProfile,
  getNetworkName,
  getProfile,
  getProfileMapObjects,
  getProfiles,
  getProjectConfig,
  getRewardByKey,
  getRewardsData,
  getStreakCountsByProfile,
  prisma,
  REWARD_REASON_DAILY_CHECKIN,
  type Profile,
  type ProfileAverageResponseDTO,
  Reward,
  sendError,
  sendSuccess,
  toProfileExperienceResponseDTO,
  toProfileMapObjectsAvailableResponseDTO,
  toProfileMapObjectsResponseDTO,
  toProfileResponseDTO,
  toProfileRewardsResponseDTO,
  toProfileStreakResponseDTO,
} from '@vaquita/shared';

const router = Router();

// Single-network: the network is implicit (one `config` row). Routes are keyed
// by wallet only — the legacy /network/:networkName prefix was removed.

// Avatar uploads are proxied through the API: the browser POSTs the raw file
// here, we validate it and forward the bytes to MinIO. `memoryStorage` keeps the
// file in a Buffer (avatars are small); the 5 MB cap is enforced by multer.
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
}).single('file');

router.get('/wallet/:walletAddress', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/wallet/:walletAddress');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/data', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../data');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, toProfileResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/experience', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../experience');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileExperienceResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/rewards', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../rewards');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileRewardsResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/streak', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../streak');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileStreakResponseDTO(await getNetworkName(), profileData));
});

router.get('/wallet/:walletAddress/daily-check', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../daily-check');

  const { success, errorMessage, errors, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for daily-check');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  return sendSuccess(res, rewardsResponse.rewards);
});

router.get('/wallet/:walletAddress/map-objects', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../map-objects');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsResponseDTO(await getNetworkName(), profileData));
});

router.post('/wallet/:walletAddress/map-objects', async (req, res) => {
  const { walletAddress } = req.params;
  const { objects } = req.body ?? {};
  req.log.info({ walletAddress, objectsCount: Array.isArray(objects) ? objects.length : undefined }, 'POST /profile/.../map-objects');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const { profileMapObjects } = await getProfileMapObjects(profileData);

  try {
    const result = await prisma.profileMapObject.update({
      where: { id: profileMapObjects.id },
      data: { objects },
    });
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileMapObjectsId: profileMapObjects.id }, 'Failed to update map objects');
    return sendError(res, 'Failed to update map objects', err, 500);
  }
});

router.get('/wallet/:walletAddress/map-objects-available', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../map-objects-available');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  return sendSuccess(res, await toProfileMapObjectsAvailableResponseDTO(await getNetworkName(), profileData));
});

router.post('/wallet/:walletAddress/gold-daily-collect', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'POST /profile/.../gold-daily-collect');

  const { success, errorMessage, errors, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for gold-daily-collect');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const rewardsResponse = await getRewardsData(profileData);

  if (!rewardsResponse.success) {
    req.log.error({ errors: rewardsResponse.errors, errorMessage: rewardsResponse.errorMessage }, 'Failed to fetch rewards data');
    return sendError(res, rewardsResponse.errorMessage, rewardsResponse.errors, 500);
  }

  const { data: rewardData, error: rewardError } = await getRewardByKey(Reward.GOLD_COIN);

  if (rewardError || !rewardData) {
    req.log.error({ err: rewardError, key: Reward.GOLD_COIN }, 'Reward not found');
    return sendError(res, 'reward not found', rewardError, 404);
  }

  const goldRewardToAmount = rewardsResponse.rewards.find((reward) => reward.key === Reward.GOLD_COIN)?.amountToCollect;

  if (!goldRewardToAmount) {
    req.log.warn({ profileId: profileData.id }, 'No gold coins available to collect');
    return sendError(res, 'there are no gold coins to collect', null, 400);
  }

  // Experience earned alongside the daily coin. The amount is the per-day cap
  // top-up from getRewardsData — max(configured XP - XP already earned today, 0)
  // — so a profile never exceeds the configured daily total. Persisted as an
  // 'earned' row stamped 'daily-checkin' so it can be summed/capped and audited.
  const experienceToCollect =
    rewardsResponse.rewards.find((reward) => reward.key === Reward.EXPERIENCE)?.amountToCollect ?? 0;
  const { data: experienceReward } = await getRewardByKey(Reward.EXPERIENCE);

  let result;
  try {
    // Atomic: the gold coin and its check-in XP are collected together, so a
    // partial failure never grants one without the other.
    const [goldRow] = await prisma.$transaction([
      prisma.profileReward.create({
        data: {
          profileId: profileData.id,
          rewardId: BigInt(rewardData.id),
          amount: goldRewardToAmount,
          reason: REWARD_REASON_DAILY_CHECKIN,
        },
      }),
      ...(experienceReward && experienceToCollect > 0
        ? [
            prisma.profileReward.create({
              data: {
                profileId: profileData.id,
                rewardId: BigInt(experienceReward.id),
                amount: experienceToCollect,
                reason: REWARD_REASON_DAILY_CHECKIN,
              },
            }),
          ]
        : []),
    ]);
    result = goldRow;
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, rewardId: rewardData.id }, 'Failed to insert profile reward');
    return sendError(res, 'Failed to collect gold coin', err, 500);
  }

  try {
    await broadcastProfileChange('gold-daily-collected', [ 'profile-rewards', 'profile-experience' ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (gold-daily-collected)');
    // No retornamos error: el reward ya se guardó. Cliente reconcilia en siguiente fetch.
  }

  req.log.info({ profileId: profileData.id }, 'Gold coin collected');
  return sendSuccess(res, {
    id: Number(result.id),
    reason: result.reason,
    amount: Number(result.amount),
    createdAt: result.createdAt,
  });
});

router.post('/wallet/:walletAddress/nickname', async (req, res) => {
  const { walletAddress } = req.params;
  const nickname = req.body?.nickname ?? '';
  req.log.info({ walletAddress, nickname }, 'POST /profile/.../nickname');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const existing = await prisma.profile.findFirst({
      where: { nickname, id: { not: profileData.id } },
      select: { id: true },
    });

    if (existing) {
      req.log.warn({ nickname }, 'Nickname already in use');
      return sendError(res, 'The nickname is already in use.', null, 409);
    }

    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data: { nickname },
    });

    try {
      await broadcastProfileChange('set-nickname', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-nickname)');
    }

    req.log.info({ profileId: profileData.id, nickname }, 'Nickname updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, nickname }, 'Failed to update nickname');
    return sendError(res, 'Failed to update nickname', err, 500);
  }
});

// Update nickname and/or email in one call. Each field is validated and saved
// INDEPENDENTLY: if the email is taken but the nickname is free, the nickname is
// still persisted and only the email reports an error (and vice versa). The
// response carries a per-field `{ saved, error }` so the UI can show a friendly
// message next to whichever field failed.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.patch('/wallet/:walletAddress/profile', async (req, res) => {
  const { walletAddress } = req.params;
  const body = req.body ?? {};
  const hasNickname = typeof body.nickname === 'string';
  const hasEmail = typeof body.email === 'string';
  req.log.info({ walletAddress, hasNickname, hasEmail }, 'PATCH /profile/.../profile');

  if (!hasNickname && !hasEmail) {
    return sendError(res, 'Provide a nickname and/or email to update.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  const result = {
    nickname: { saved: false, error: null as string | null },
    email: { saved: false, error: null as string | null },
  };
  const data: { nickname?: string; email?: string } = {};

  // --- Nickname ---
  if (hasNickname) {
    const nickname = String(body.nickname).trim();
    if (!nickname) {
      result.nickname.error = 'Please enter a nickname.';
    } else if (nickname.length > 50) {
      result.nickname.error = 'That nickname is too long (max 50 characters).';
    } else {
      const taken = await prisma.profile.findFirst({
        where: { nickname, id: { not: profileData.id }, deletedAt: null },
        select: { id: true },
      });
      if (taken) {
        result.nickname.error = 'That nickname is already taken. Please choose another one.';
      } else {
        data.nickname = nickname;
      }
    }
  }

  // --- Email ---
  if (hasEmail) {
    const email = String(body.email).trim();
    if (!email) {
      result.email.error = 'Please enter an email address.';
    } else if (email.length > 100) {
      result.email.error = 'That email is too long (max 100 characters).';
    } else if (!EMAIL_REGEX.test(email)) {
      result.email.error = 'Please enter a valid email address.';
    } else {
      // Case-insensitive match so Foo@x.com can't shadow foo@x.com on another account.
      const taken = await prisma.profile.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          id: { not: profileData.id },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (taken) {
        result.email.error = 'That email is already registered to another account.';
      } else {
        data.email = email;
      }
    }
  }

  // Persist only the fields that passed validation.
  if (Object.keys(data).length > 0) {
    try {
      await prisma.profile.update({ where: { id: profileData.id }, data });
      if (data.nickname !== undefined) result.nickname.saved = true;
      if (data.email !== undefined) result.email.saved = true;

      try {
        await broadcastProfileChange('set-profile', ['profile-data']);
      } catch (err) {
        req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-profile)');
      }

      req.log.info({ profileId: profileData.id, ...data }, 'Profile updated');
    } catch (err) {
      req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile');
      return sendError(res, 'Failed to save profile', err, 500);
    }
  }

  return sendSuccess(res, result);
});

// Runs the multer middleware as a promise so we can validate inside the async
// handler and surface upload errors (e.g. file too large) as clean JSON.
const runAvatarUpload = (req: Parameters<typeof avatarUpload>[0], res: Parameters<typeof avatarUpload>[1]) =>
  new Promise<void>((resolve, reject) => {
    avatarUpload(req, res, (err: unknown) => (err ? reject(err) : resolve()));
  });

router.post('/wallet/:walletAddress/avatar', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'POST /profile/.../avatar');

  if (!isStorageConfigured) {
    req.log.error('Avatar upload attempted but MinIO storage is not configured');
    return sendError(res, 'Photo uploads are not available right now.', null, 503);
  }

  try {
    await runAvatarUpload(req, res);
  } catch (err) {
    const tooLarge = (err as { code?: string })?.code === 'LIMIT_FILE_SIZE';
    req.log.warn({ err, walletAddress }, 'Avatar upload rejected by multer');
    return sendError(res, tooLarge ? 'The image is too large (max 5 MB).' : 'Could not read the uploaded file.', null, 400);
  }

  const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string; size: number } }).file;
  if (!file) {
    return sendError(res, 'No image file was provided.', null, 400);
  }

  const ext = AVATAR_MIME_EXT[file.mimetype];
  if (!ext) {
    return sendError(res, 'Unsupported image type. Use JPG, PNG, WEBP or GIF.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const key = `${profileData.id}/${v4()}.${ext}`;
    const { url } = await putAvatar({ key, body: file.buffer, contentType: file.mimetype });

    const previousKey = profileData.avatar_key ?? null;

    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data: { avatarUrl: url, avatarKey: key },
    });

    // Replace = delete the object we just superseded, after the DB points at the new one.
    if (previousKey && previousKey !== key) await removeAvatar(previousKey);

    try {
      await broadcastProfileChange('set-avatar', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-avatar)');
    }

    req.log.info({ profileId: profileData.id, key }, 'Avatar updated');
    return sendSuccess(res, { avatarUrl: result.avatarUrl });
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to upload avatar');
    return sendError(res, 'Failed to upload photo', err, 500);
  }
});

router.delete('/wallet/:walletAddress/avatar', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'DELETE /profile/.../avatar');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const previousKey = profileData.avatar_key ?? null;

    await prisma.profile.update({
      where: { id: profileData.id },
      data: { avatarUrl: null, avatarKey: null },
    });

    if (previousKey) await removeAvatar(previousKey);

    try {
      await broadcastProfileChange('set-avatar', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (remove-avatar)');
    }

    req.log.info({ profileId: profileData.id }, 'Avatar removed');
    return sendSuccess(res, { avatarUrl: '' });
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to remove avatar');
    return sendError(res, 'Failed to remove photo', err, 500);
  }
});

router.patch('/wallet/:walletAddress/flags', async (req, res) => {
  const { walletAddress } = req.params;
  const { onboardingCompleted, tutorialCompleted, cryptoSavvy } = req.body ?? {};
  req.log.info({ walletAddress, onboardingCompleted, tutorialCompleted, cryptoSavvy }, 'PATCH /profile/.../flags');

  // Build a partial update from only the flags actually present in the body, so
  // a toggle can be flipped without touching the others.
  const data: { onboardingCompleted?: boolean; tutorialCompleted?: boolean; cryptoSavvy?: boolean } = {};
  if (typeof onboardingCompleted === 'boolean') data.onboardingCompleted = onboardingCompleted;
  if (typeof tutorialCompleted === 'boolean') data.tutorialCompleted = tutorialCompleted;
  if (typeof cryptoSavvy === 'boolean') data.cryptoSavvy = cryptoSavvy;

  if (Object.keys(data).length === 0) {
    return sendError(res, 'Provide a boolean onboardingCompleted, tutorialCompleted and/or cryptoSavvy.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data,
    });

    try {
      await broadcastProfileChange('set-flags', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-flags)');
    }

    req.log.info({ profileId: profileData.id, ...data }, 'Profile flags updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile flags');
    return sendError(res, 'Failed to update profile flags', err, 500);
  }
});

// Persist the user's display preferences (language / currency). Each value must
// be the `id` of an option offered by the active project config — anything else
// is rejected so we never store a selection the UI can't render.
router.patch('/wallet/:walletAddress/preferences', async (req, res) => {
  const { walletAddress } = req.params;
  const { language, currency } = req.body ?? {};
  req.log.info({ walletAddress, language, currency }, 'PATCH /profile/.../preferences');

  if (language !== undefined && typeof language !== 'string') {
    return sendError(res, 'language must be a string option id.', null, 400);
  }
  if (currency !== undefined && typeof currency !== 'string') {
    return sendError(res, 'currency must be a string option id.', null, 400);
  }
  if (language === undefined && currency === undefined) {
    return sendError(res, 'Provide a language and/or currency option id.', null, 400);
  }

  const config = await getProjectConfig();
  if (!config) {
    return sendError(res, 'project config not found', null, 404);
  }

  // Validate each provided id against the configured option lists.
  const data: { language?: string; currency?: string } = {};
  if (language !== undefined) {
    if (!config.languages.some((l) => l.id === language)) {
      return sendError(res, `Unsupported language '${language}'.`, null, 400);
    }
    data.language = language;
  }
  if (currency !== undefined) {
    if (!config.currencies.some((c) => c.id === currency)) {
      return sendError(res, `Unsupported currency '${currency}'.`, null, 400);
    }
    data.currency = currency;
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage, errors, 404);
  }

  try {
    const result = await prisma.profile.update({
      where: { id: profileData.id },
      data,
    });

    try {
      await broadcastProfileChange('set-preferences', [ 'profile-data' ]);
    } catch (err) {
      req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (set-preferences)');
    }

    req.log.info({ profileId: profileData.id, ...data }, 'Profile preferences updated');
    return sendSuccess(res, result);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id, data }, 'Failed to update profile preferences');
    return sendError(res, 'Failed to update profile preferences', err, 500);
  }
});

router.get('/nickname-available', async (req, res) => {
  const nickname = String(req.query?.nickname ?? '').trim();
  req.log.info({ nickname }, 'GET /profile/nickname-available');

  if (!nickname) {
    return sendSuccess(res, { available: false });
  }

  try {
    const existing = await prisma.profile.findFirst({
      where: { nickname },
      select: { id: true },
    });
    return sendSuccess(res, { available: !existing });
  } catch (err) {
    req.log.error({ err, nickname }, 'Failed to check nickname availability');
    return sendError(res, 'Failed to check nickname availability', err, 500);
  }
});

router.get('/', async (req, res) => {
  req.log.info('GET /profile (list)');

  const { data, error } = await getProfiles();

  if (error) {
    req.log.error({ err: error }, 'Failed to list profiles');
    return sendError(res, 'Failed to list profiles', error, 500);
  }

  const networkName = await getNetworkName();
  return sendSuccess(res, data.map((profile) => toProfileResponseDTO(networkName, profile)), '');
});

// Builds the leaderboard row for a profile. `totalSums`/`lastSum` now hold the
// profile's current active-deposit balance (computed on the fly from `deposits`,
// see getActiveDepositSumsByWallet) instead of the old 30-day snapshot series.
// `count` is 1 so the frontend's `totalSums / count` ranking equals the balance.
const toProfileByDepositsResponseDTO = (
  badgesByProfileId: Map<number, number>,
  depositSumsByWallet: Map<string, number>,
  streaksByProfileId: Map<number, number>,
  experienceByProfileId: Map<number, number>,
) =>
  (profile: Profile): ProfileAverageResponseDTO => {
    const wallet = profile.wallet_address ?? '';
    const sum = depositSumsByWallet.get(wallet) ?? 0;

    return {
      email: profile.email ?? '',
      fullName: profile.full_name ?? '',
      nickname: profile.nickname ?? '',
      avatarUrl: profile.avatar_url ?? '',
      walletAddress: wallet,
      totalSums: sum,
      lastSum: sum,
      count: 1,
      timestamp: 0,
      delay: 0,
      badges: badgesByProfileId.get(profile.id) ?? 0,
      streak: streaksByProfileId.get(profile.id) ?? 0,
      experience: experienceByProfileId.get(profile.id) ?? 0,
    };
  };

router.get('/by-average-deposits', async (req, res) => {
  req.log.info('GET /profile/by-average-deposits');

  const { data, error } = await getProfiles();

  if (error) {
    req.log.error({ err: error }, 'Failed to list profiles');
    return sendError(res, 'Failed to list profiles', error, 500);
  }

  const { counts: badgesByProfileId, error: badgesError } = await getAchievementCountsByProfile();
  if (badgesError) {
    req.log.error({ err: badgesError }, 'Failed to fetch badge counts (degraded — leaderboard will show 0 badges)');
  }

  const { sums: depositSumsByWallet, error: depositsError } = await getActiveDepositSumsByWallet();
  if (depositsError) {
    req.log.error({ err: depositsError }, 'Failed to compute active deposit sums (degraded — leaderboard amounts will be 0)');
  }

  const { counts: streaksByProfileId, error: streaksError } = await getStreakCountsByProfile();
  if (streaksError) {
    req.log.error({ err: streaksError }, 'Failed to compute streaks (degraded — leaderboard will show 0-day streaks)');
  }

  const { experience: experienceByProfileId, error: experienceError } = await getExperienceByProfile(data);
  if (experienceError) {
    req.log.error({ err: experienceError }, 'Failed to compute experience (degraded — leaderboard will show level 1)');
  }

  return sendSuccess(
    res,
    data.map(
      toProfileByDepositsResponseDTO(
        badgesByProfileId,
        depositSumsByWallet,
        streaksByProfileId,
        experienceByProfileId,
      ),
    ),
    '',
  );
});

export default router;
