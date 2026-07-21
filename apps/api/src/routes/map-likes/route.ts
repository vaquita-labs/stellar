import { Router } from 'express';
import {
  getLikedMapWallets,
  getMapLikeCount,
  getNetworkName,
  likeMap,
  sendError,
  sendSuccess,
  unlikeMap,
  type LikedMapWalletsResponseDTO,
  type MapLikeCountResponseDTO,
  type MapLikeResponseDTO,
} from '@vaquita/shared';

const router = Router();

// Wallet-trust auth, same as /follows: the viewer is the `walletAddress` in the
// URL. Worth noting this is the existing convention for the social graph, not a
// choice made here — when follows move behind the wallet session, likes should
// move with them (see docs/todo/api-security-wallet-session.md).

// GET /api/v1/map-likes/wallet/:walletAddress/count
// How many hearts this profile's map has collected.
router.get('/wallet/:walletAddress/count', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /map-likes/.../count');

  try {
    const likes = await getMapLikeCount(walletAddress);
    const payload: MapLikeCountResponseDTO = {
      networkName: await getNetworkName(),
      walletAddress,
      likes,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load map like count');
    return sendError(res, 'Failed to load map likes', err, 500);
  }
});

// GET /api/v1/map-likes/wallet/:walletAddress/liked
// Wallets whose map the viewer already liked — seeds every heart button in a
// feed from one request instead of one per row.
router.get('/wallet/:walletAddress/liked', async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /map-likes/.../liked');

  try {
    const wallets = await getLikedMapWallets(walletAddress);
    const payload: LikedMapWalletsResponseDTO = {
      networkName: await getNetworkName(),
      walletAddress,
      wallets,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress }, 'Failed to load liked maps');
    return sendError(res, 'Failed to load liked maps', err, 500);
  }
});

// POST /api/v1/map-likes/wallet/:walletAddress/like { targetWallet }
// Viewer hearts `targetWallet`'s map. Idempotent; self-likes are rejected.
router.post('/wallet/:walletAddress/like', async (req, res) => {
  const { walletAddress } = req.params;
  const targetWallet = String(req.body?.targetWallet ?? '').trim();
  req.log.info({ walletAddress, targetWallet }, 'POST /map-likes/.../like');

  if (!targetWallet) {
    return sendError(res, 'A targetWallet is required.', null, 400);
  }

  try {
    const { success, errorMessage, liked } = await likeMap(walletAddress, targetWallet);
    if (!success) {
      return sendError(res, errorMessage, null, 400);
    }
    const likes = await getMapLikeCount(targetWallet);
    const payload: MapLikeResponseDTO = { likerWallet: walletAddress, ownerWallet: targetWallet, liked, likes };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress, targetWallet }, 'Failed to like map');
    return sendError(res, 'Failed to like map', err, 500);
  }
});

// DELETE /api/v1/map-likes/wallet/:walletAddress/like/:targetWallet
// Removes the heart. Idempotent.
router.delete('/wallet/:walletAddress/like/:targetWallet', async (req, res) => {
  const { walletAddress, targetWallet } = req.params;
  req.log.info({ walletAddress, targetWallet }, 'DELETE /map-likes/.../like/:targetWallet');

  try {
    await unlikeMap(walletAddress, targetWallet);
    const likes = await getMapLikeCount(targetWallet);
    const payload: MapLikeResponseDTO = {
      likerWallet: walletAddress,
      ownerWallet: targetWallet,
      liked: false,
      likes,
    };
    return sendSuccess(res, payload);
  } catch (err) {
    req.log.error({ err, walletAddress, targetWallet }, 'Failed to unlike map');
    return sendError(res, 'Failed to unlike map', err, 500);
  }
});

export default router;
