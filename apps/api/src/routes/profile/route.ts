import { Router } from 'express';
import multer from 'multer';
import { v4 } from 'uuid';
import { isStorageConfigured, putAvatar, removeAvatar } from '../../lib/storage';
import {
  Achievement,
  broadcastProfileChange,
  claimAchievement,
  computeEligibilitySignals,
  getAchievementByKey,
  getAchievementCountsByProfile,
  getActiveDepositSumsByWallet,
  getLastClosedCycleId,
  getLeaderboardRankForWallet,
  getNetworkName,
  getProfile,
  getProfileMapObjects,
  getProfiles,
  getRewardByKey,
  getRewardsData,
  isAchievementEligible,
  prisma,
  type Profile,
  type ProfileAverageResponseDTO,
  redeemAchievementCode,
  Reward,
  sendError,
  sendSuccess,
  toProfileAchievementsResponseDTO,
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

  let result;
  try {
    result = await prisma.profileReward.create({
      data: {
        profileId: profileData.id,
        rewardId: BigInt(rewardData.id),
        type: 'collected',
        amount: 1,
      },
    });
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
  return sendSuccess(res, result);
});

router.get('/wallet/:walletAddress/achievements', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /profile/.../achievements');

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  return sendSuccess(res, await toProfileAchievementsResponseDTO(await getNetworkName(), profileData));
});

router.post('/wallet/:walletAddress/achievements/:key/claim', async (req, res) => {
  const { walletAddress, key } = req.params;
  req.log.info({ walletAddress, key }, 'POST /profile/.../achievements/:key/claim');

  // TODO(auth): match the wallet-in-URL trust used by every other profile
  // route for v1. When we harden auth across the API (challenge/response via
  // StellarWalletsKit.signMessage verified server-side), this endpoint moves
  // along with the rest — don't add a one-off signature check here.

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for achievement claim');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const achievementKey = key as Achievement;

  // The catalog (DB) is the source of truth for which badges exist — admin can
  // add new ones beyond the static Achievement enum, so we validate against the
  // row, not the enum.
  const { data: achievementDoc } = await getAchievementByKey(achievementKey);
  if (!achievementDoc) {
    req.log.warn({ key }, 'Unknown achievement key');
    return sendError(res, `Unknown achievement: ${key}`, null, 404);
  }

  if (achievementDoc.unlock_type === 'cycle_rank' || achievementDoc.cycle_scoped) {
    // Leaderboard badges: verify rank against the last closed cycle.
    const cycleId = getLastClosedCycleId();
    const rank = await getLeaderboardRankForWallet(walletAddress, cycleId);
    const exactRank: Record<string, number> = { 'first-place': 1, 'second-place': 2 };
    const eligible =
      achievementKey === 'third-place'
        ? rank !== null && rank >= 3 && rank <= 10
        : rank === exactRank[achievementKey];
    if (!eligible) {
      req.log.warn({ profileId: profileData.id, key, rank, cycleId }, 'Wallet did not finish at required leaderboard rank');
      return sendError(res, 'You did not finish at the required leaderboard rank last cycle.', null, 403);
    }
  } else if (achievementDoc.unlock_type === 'rule') {
    // Signal-driven badges: evaluate the configurable rule.
    const signals = await computeEligibilitySignals(profileData);
    if (!isAchievementEligible(achievementDoc, signals)) {
      req.log.warn(
        { profileId: profileData.id, key, signals },
        'Profile is not eligible for achievement',
      );
      return sendError(res, 'You are not eligible for this achievement yet.', null, 403);
    }
  } else {
    // redeem_code / manual badges are not claimable through this endpoint.
    req.log.warn({ profileId: profileData.id, key, unlockType: achievementDoc.unlock_type }, 'Achievement not claimable via this endpoint');
    return sendError(
      res,
      achievementDoc.unlock_type === 'redeem_code'
        ? 'This badge is claimable only with a redeem code.'
        : 'This badge is granted manually and cannot be claimed here.',
      null,
      403,
    );
  }

  const result = await claimAchievement(profileData.id, achievementKey);

  if (!result.success) {
    if (result.alreadyClaimed) {
      req.log.info({ profileId: profileData.id, key }, 'Achievement already claimed');
      return sendError(res, 'You already claimed this achievement.', null, 409);
    }
    req.log.error({ err: result.error, profileId: profileData.id, key }, 'Failed to claim achievement');
    return sendError(res, 'Failed to claim achievement', result.error, 500);
  }

  try {
    await broadcastProfileChange('achievement-claimed', [
      'profile-achievements',
      'profile-rewards',
      'profile-experience',
    ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast profile change (achievement-claimed)');
  }

  req.log.info({ profileId: profileData.id, key, coinReward: result.coinReward }, 'Achievement claimed');
  return sendSuccess(res, {
    achievementKey,
    coinReward: result.coinReward,
    claimedAt: result.claimedAt,
  });
});

router.post('/wallet/:walletAddress/achievements/redeem', async (req, res) => {
  const { walletAddress } = req.params;
  const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  req.log.info({ walletAddress, code: rawCode }, 'POST /profile/.../achievements/redeem');

  // TODO(auth): same wallet-in-URL trust as every other profile route. When
  // the API-wide auth hardening lands this endpoint follows along.

  if (!rawCode) {
    return sendError(res, 'A code is required.', null, 400);
  }

  const { success, errors, errorMessage, profileData } = await getProfile(walletAddress);

  if (!success || !profileData) {
    req.log.error({ errors, errorMessage, walletAddress }, 'Profile not resolved for redeem');
    return sendError(res, errorMessage ?? 'Profile not resolved', errors, 404);
  }

  const result = await redeemAchievementCode(profileData.id, rawCode);

  if (!result.success) {
    if (result.notFound) {
      req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code not found');
      return sendError(res, 'That code is not valid.', null, 404);
    }
    if (result.alreadyClaimed) {
      req.log.info({ profileId: profileData.id, code: rawCode }, 'Redeem code already claimed');
      return sendError(res, 'You already claimed this achievement.', null, 409);
    }
    req.log.error({ err: result.error, profileId: profileData.id, code: rawCode }, 'Failed to redeem code');
    return sendError(res, 'Failed to redeem code', result.error, 500);
  }

  try {
    await broadcastProfileChange('achievement-claimed', [
      'profile-achievements',
      'profile-rewards',
      'profile-experience',
    ]);
  } catch (err) {
    req.log.error({ err, profileId: profileData.id }, 'Failed to broadcast (achievement-claimed via redeem)');
  }

  req.log.info(
    { profileId: profileData.id, key: result.achievementKey, coinReward: result.coinReward },
    'Achievement claimed via redeem code',
  );
  return sendSuccess(res, {
    achievementKey: result.achievementKey,
    coinReward: result.coinReward,
    claimedAt: result.claimedAt,
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

  return sendSuccess(
    res,
    data.map(toProfileByDepositsResponseDTO(badgesByProfileId, depositSumsByWallet)),
    '',
  );
});

export default router;
