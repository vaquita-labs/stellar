import { Router } from 'express';
import { sendError, sendSuccess } from '@vaquita/shared';
import {
  buildAuthChallenge,
  isValidWalletAddress,
  issueSessionToken,
  verifyAuthChallenge,
} from '../../lib/walletAuth';

const router = Router();

// Step 1 of wallet login: hand out a SEP-10 challenge transaction for the
// claimed wallet. Holding a challenge proves nothing — only signing it does.
router.post('/challenge', (req, res) => {
  const { walletAddress } = (req.body ?? {}) as { walletAddress?: unknown };
  if (!isValidWalletAddress(walletAddress)) {
    return sendError(res, 'A valid Stellar wallet address is required.', null, 400);
  }
  req.log.info({ walletAddress }, 'POST /auth/challenge');
  return sendSuccess(res, buildAuthChallenge(walletAddress));
});

// Step 2: the wallet signed the challenge → issue a session token.
router.post('/verify', (req, res) => {
  const { walletAddress, signedXdr } = (req.body ?? {}) as {
    walletAddress?: unknown;
    signedXdr?: unknown;
  };
  if (!isValidWalletAddress(walletAddress) || typeof signedXdr !== 'string' || !signedXdr) {
    return sendError(res, 'walletAddress and signedXdr are required.', null, 400);
  }
  try {
    const wallet = verifyAuthChallenge(signedXdr, walletAddress);
    const { token, expiresAt } = issueSessionToken(wallet);
    req.log.info({ walletAddress: wallet }, 'Wallet session issued');
    return sendSuccess(res, { token, expiresAt, walletAddress: wallet });
  } catch (err) {
    req.log.warn({ err, walletAddress }, 'Challenge verification failed');
    return sendError(res, 'Could not verify the wallet signature.', null, 401);
  }
});

export default router;
