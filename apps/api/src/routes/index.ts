import { Router } from 'express';
import ablyRoutes from './ably/route';
import adminRoutes from './admin/route';
import badgeRoutes from './badge/route';
import badgeCatalogRoutes from './badges/route';
import configRoutes from './config/route';
import depositRoutes from './deposit/route';
import followRoutes from './follows/route';
import leaderboardRoutes from './leaderboard/route';
import notificationRoutes from './notifications/route';
import profileRoutes from './profile/route';
import userRoutes from './user/route';
import walletBadgeRoutes from './wallets/badges.route';

const router = Router();

router.use('/ably', ablyRoutes);
router.use('/admin', adminRoutes);
router.use('/badge', badgeRoutes);
router.use('/badges', badgeCatalogRoutes);
router.use('/config', configRoutes);
router.use('/profile', profileRoutes);
router.use('/wallets/:wallet/badges', walletBadgeRoutes);
router.use('/deposit', depositRoutes);
router.use('/follows', followRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/user', userRoutes);

export default router;
