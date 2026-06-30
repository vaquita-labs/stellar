import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import {
  attachBridgeDestinationTx,
  attachBridgeSourceTx,
  bridgeCreateSchema,
  bridgeDestinationTxSchema,
  bridgeListQuerySchema,
  bridgeSourceTxSchema,
  createBridgeTransfer,
  fetchCircleCctpAttestation,
  listActiveBridgeTransfers,
  prismaBridgeTransferRepository,
  refreshBridgeTransfer,
  sendError,
  sendSuccess,
} from '@vaquita/shared';

const router = Router();

const asyncHandler = <
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
>(
  fn: (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> =>
  async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      req.log.error({ err }, 'Unhandled error in bridge route handler');
      next(err);
    }
  };

router.post('/transfers', asyncHandler(async (req, res) => {
  const parsed = bridgeCreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 'Invalid bridge transfer payload', parsed.error.format(), 400);

  try {
    const transfer = await createBridgeTransfer(prismaBridgeTransferRepository, parsed.data);
    return sendSuccess(res, transfer, 'bridge transfer created');
  } catch (err) {
    return sendError(res, (err as Error)?.message ?? 'Could not create bridge transfer', err, 400);
  }
}));

router.get('/transfers', asyncHandler(async (req, res) => {
  const parsed = bridgeListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 'Invalid bridge transfer query', parsed.error.format(), 400);

  const transfers = await listActiveBridgeTransfers(prismaBridgeTransferRepository, parsed.data.wallet);
  return sendSuccess(res, transfers, '');
}));

router.post('/transfers/:id/source-tx', asyncHandler(async (req, res) => {
  const parsed = bridgeSourceTxSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 'Invalid source transaction payload', parsed.error.format(), 400);

  try {
    const transfer = await attachBridgeSourceTx(prismaBridgeTransferRepository, req.params.id, {
      sourceTxHash: parsed.data.sourceTxHash,
      messageHash: parsed.data.messageHash ?? null,
    });
    return sendSuccess(res, transfer, 'source transaction attached');
  } catch (err) {
    return sendError(res, (err as Error)?.message ?? 'Could not attach source transaction', err, 400);
  }
}));

router.post('/transfers/:id/refresh', asyncHandler(async (req, res) => {
  try {
    const transfer = await refreshBridgeTransfer(
      prismaBridgeTransferRepository,
      req.params.id,
      fetchCircleCctpAttestation,
    );
    return sendSuccess(res, transfer, 'bridge transfer refreshed');
  } catch (err) {
    return sendError(res, (err as Error)?.message ?? 'Could not refresh bridge transfer', err, 400);
  }
}));

router.post('/transfers/:id/destination-tx', asyncHandler(async (req, res) => {
  const parsed = bridgeDestinationTxSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 'Invalid destination transaction payload', parsed.error.format(), 400);

  try {
    const transfer = await attachBridgeDestinationTx(prismaBridgeTransferRepository, req.params.id, parsed.data);
    return sendSuccess(res, transfer, 'destination transaction attached');
  } catch (err) {
    return sendError(res, (err as Error)?.message ?? 'Could not attach destination transaction', err, 400);
  }
}));

export default router;
