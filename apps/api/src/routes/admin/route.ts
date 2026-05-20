import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';

const router = Router();

const asyncHandler = <P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };

function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // not configured — open (dev only)
  const provided = req.headers['x-admin-secret'] as string | undefined;
  if (provided !== secret) {
    res.status(403).json({ status: 'error', message: 'Forbidden' });
    return false;
  }
  return true;
}

export { requireAdminSecret };

export default router;
