import { Router } from 'express';
import achievementsRoutes from './achievements/route';
import adminRoutes from './admin/route';
import badgeRoutes from './badge/route';
import claimRoutes from './claim/route';
import configRoutes from './config/route';
import depositRoutes from './deposit/route';
import leaderboardRoutes from './leaderboard/route';
import profileRoutes from './profile/route';
import userRoutes from './user/route';

const router = Router();

router.use('/achievements', achievementsRoutes);
router.use('/admin', adminRoutes);
router.use('/badge', badgeRoutes);
router.use('/claim', claimRoutes);
router.use('/config', configRoutes);
router.use('/profile', profileRoutes);
router.use('/deposit', depositRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/user', userRoutes);

export default router;
