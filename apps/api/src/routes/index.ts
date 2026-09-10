import { Router } from 'express';
import { isMetricsEnabled, metricsHandler } from '../lib/metrics';
import ablyRoutes from './ably/route';
import attributionRoutes from './attribution/route';
import authRoutes from './auth/route';
import badgeRoutes from './badge/route';
import badgeCatalogRoutes from './badges/route';
import bridgeRoutes from './bridge/route';
import configRoutes from './config/route';
import depositRoutes from './deposit/route';
import exploreRoutes from './explore/route';
import feedbackRoutes from './feedback/route';
import followRoutes from './follows/route';
import healthRoutes from './health/route';
import leaderboardRoutes from './leaderboard/route';
import legalRoutes from './legal/route';
import mapLikeRoutes from './map-likes/route';
import notificationRoutes from './notifications/route';
import offrampRoutes from './offramp/route';
import onrampRoutes from './onramp/route';
import profileRoutes from './profile/route';
import pwaInstallRoutes from './pwa-installs/route';
import referralRoutes from './referral/route';
import releaseNoteRoutes from './release-notes/route';
import timeRoutes from './time/route';
import userRoutes from './user/route';
import vaultFlowRoutes from './vault-flows/route';
import walletBalanceRoutes from './wallets/balances.route';
import savedBankRoutes from './wallets/savedBanks.route';
import savedWalletRoutes from './wallets/saved.route';
import walletBadgeRoutes from './wallets/badges.route';

const router = Router();

// Private-only metrics scrape endpoint (Prometheus exposition). Opt-in via
// OBSERVABILITY_METRICS_ENABLED; intended for host/container scraping by Alloy,
// never public exposure.
if (isMetricsEnabled()) {
  router.get('/metrics', metricsHandler);
}

router.use('/health', healthRoutes);
router.use('/ably', ablyRoutes);
router.use('/auth', authRoutes);
router.use('/badge', badgeRoutes);
router.use('/badges', badgeCatalogRoutes);
router.use('/bridge', bridgeRoutes);
router.use('/config', configRoutes);
router.use('/profile', profileRoutes);
// Antes que `/wallets/saved`: los dos comparten prefijo y montar el más
// específico primero deja el ruteo sin depender de cómo corta segmentos Express.
router.use('/wallets/balances', walletBalanceRoutes);
router.use('/wallets/saved-banks', savedBankRoutes);
router.use('/wallets/saved', savedWalletRoutes);
router.use('/wallets/:wallet/badges', walletBadgeRoutes);
router.use('/deposit', depositRoutes);
router.use('/explore', exploreRoutes);
router.use('/attribution', attributionRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/follows', followRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/legal', legalRoutes);
router.use('/map-likes', mapLikeRoutes);
router.use('/release-notes', releaseNoteRoutes);
router.use('/notifications', notificationRoutes);
router.use('/offramp', offrampRoutes);
router.use('/onramp', onrampRoutes);
router.use('/pwa-installs', pwaInstallRoutes);
router.use('/referrals', referralRoutes);
router.use('/time', timeRoutes);
router.use('/user', userRoutes);
router.use('/vault-flows', vaultFlowRoutes);

export default router;
