import { Router } from 'express';
import {
  type FollowCountsResponseDTO,
  type FollowResponseDTO,
  type FollowingWalletsResponseDTO,
  type FriendSearchResponseDTO,
  type FriendSuggestionsResponseDTO,
  followProfile,
  getFollowCounts,
  getFollowingWallets,
  getFriendSuggestions,
  getNetworkName,
  searchFriends,
  sendError,
  sendSuccess,
  unfollowProfile,
} from '@vaquita/shared';

const router = Router();

// Single-network + wallet-trust auth, same as the rest of the API: the viewer is
// identified by the `walletAddress` in the URL, no session/JWT.

// GET /api/v1/follows/wallet/:walletAddress/search?q=&limit=
// Lists vaqueros for the friend-search screen, with `isFollowing` resolved
// against the viewer. An empty `q` returns the newest profiles ("Popular").
router.get('/wallet/:walletAddress/search', async (req, res) => {
  const { walletAddress } = req.params;
  const q = String(req.query?.q ?? '').trim();
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 20;
  req.log.info({ walletAddress, q, limit }, 'GET /follows/.../search');

  try {
    const { results } = await searchFriends({ viewerWallet: walletAddress, query: q, limit });
    const payload: FriendSearchResponseDTO = {
      networkName: await getNetworkName(),
      query: q,
      results,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress, q }, 'Failed to search friends');
    return sendError(res, 'Failed to search vaqueros', err, 500);
  }
});

// GET /api/v1/follows/wallet/:walletAddress/counts
// Following + follower counts shown on the /profile stats row.
router.get('/wallet/:walletAddress/counts', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /follows/.../counts');

  try {
    const { following, followers } = await getFollowCounts(walletAddress);
    const payload: FollowCountsResponseDTO = {
      networkName: await getNetworkName(),
      walletAddress,
      following,
      followers,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load follow counts');
    return sendError(res, 'Failed to load follow counts', err, 500);
  }
});

// GET /api/v1/follows/wallet/:walletAddress/following
// Wallet addresses the viewer currently follows. Seeds per-row Follow buttons
// (e.g. the leaderboard) so a follow survives a reload.
router.get('/wallet/:walletAddress/following', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /follows/.../following');

  try {
    const following = await getFollowingWallets(walletAddress);
    const payload: FollowingWalletsResponseDTO = {
      networkName: await getNetworkName(),
      walletAddress,
      following,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load following list');
    return sendError(res, 'Failed to load following list', err, 500);
  }
});

// GET /api/v1/follows/wallet/:walletAddress/suggestions?limit=5
// Friend suggestions for the "Friend suggestions" rail: friends-of-friends
// first, random fill for the rest.
router.get('/wallet/:walletAddress/suggestions', async (req, res) => {
  const { walletAddress } = req.params;
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 5;
  req.log.info({ walletAddress, limit }, 'GET /follows/.../suggestions');

  try {
    const { suggestions } = await getFriendSuggestions({ viewerWallet: walletAddress, limit });
    const payload: FriendSuggestionsResponseDTO = {
      networkName: await getNetworkName(),
      suggestions,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load friend suggestions');
    return sendError(res, 'Failed to load friend suggestions', err, 500);
  }
});

// POST /api/v1/follows/wallet/:walletAddress/follow  body: { targetWallet }
// Makes the viewer follow `targetWallet`. Idempotent.
router.post('/wallet/:walletAddress/follow', async (req, res) => {
  const { walletAddress } = req.params;
  const targetWallet = String(req.body?.targetWallet ?? '').trim();
  req.log.info({ walletAddress, targetWallet }, 'POST /follows/.../follow');

  if (!targetWallet) {
    return sendError(res, 'A targetWallet is required.', null, 400);
  }

  try {
    const { success, errorMessage, following } = await followProfile(walletAddress, targetWallet);
    if (!success) {
      return sendError(res, errorMessage, null, 400);
    }
    const payload: FollowResponseDTO = { followerWallet: walletAddress, followeeWallet: targetWallet, following };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress, targetWallet }, 'Failed to follow');
    return sendError(res, 'Failed to follow vaquero', err, 500);
  }
});

// DELETE /api/v1/follows/wallet/:walletAddress/follow/:targetWallet
// Makes the viewer unfollow `targetWallet`. Idempotent.
router.delete('/wallet/:walletAddress/follow/:targetWallet', async (req, res) => {
  const { walletAddress, targetWallet } = req.params;
  req.log.info({ walletAddress, targetWallet }, 'DELETE /follows/.../follow/:targetWallet');

  try {
    await unfollowProfile(walletAddress, targetWallet);
    const payload: FollowResponseDTO = { followerWallet: walletAddress, followeeWallet: targetWallet, following: false };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress, targetWallet }, 'Failed to unfollow');
    return sendError(res, 'Failed to unfollow vaquero', err, 500);
  }
});

export default router;
