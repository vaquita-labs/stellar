import { Router } from 'express';
import configRoutes from './config/route';
import depositRoutes from './deposit/route';
import networkRoutes from './network/route';
import profileRoutes from './profile/route';
import userRoutes from './user/route';

const router = Router();

router.use('/config', configRoutes);
router.use('/profile', profileRoutes);
router.use('/deposit', depositRoutes);
router.use('/network', networkRoutes);
router.use('/user', userRoutes);

export default router;
