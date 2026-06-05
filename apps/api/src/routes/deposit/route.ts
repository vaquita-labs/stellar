import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { v4 } from 'uuid';
import {
  confirmDepositWithTx,
  createDepositByNames,
  creteConfirmWithdrawal,
  creteWithdrawal,
  dataToDepositResponseDTOTotalDepositsResponseDTO,
  depositSchema,
  failDepositWithTx,
  getCachedDepositsByNetworkIdWalletAddress,
  getDepositsById,
  getDepositsByNetworkId,
  getDummyApyData,
  getNetworkById,
  getNetworkByName,
  getStellarApyData,
  getTokenBySymbol,
  getTokenNetworkByNetworkIdTokenId,
  sendError,
  sendSuccess,
  toDepositResponseDTO,
  tryParsePoolError,
} from '@vaquita/shared';

/**
 * Returns a typed VaquitaPoolError response when `err` is a recognised contract
 * error, or `null` so the caller can fall back to a generic sendError.
 */
function poolErrorResponse(res: Response, err: unknown): ReturnType<typeof res.json> | null {
  const poolErr = tryParsePoolError(err);
  if (!poolErr) return null;
  return res.status(poolErr.httpStatus).json({
    status: 'error',
    message: poolErr.message,
    errorCode: poolErr.code,
  });
}

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
      req.log.error({ err }, 'Unhandled error in deposit route handler');
      next(err);
    }
  };

router.post('/', asyncHandler(async (req, res) => {
  req.log.info('POST /deposit');

  const { data, success, error } = depositSchema.safeParse(req.body);

  if (!success || !data) {
    req.log.warn({ err: error?.format?.() ?? error }, 'Invalid deposit payload');
    return sendError(res, 'Payload inválido', error, 400);
  }

  const childLog = req.log.child({
    walletAddress: data.walletAddress,
    networkName: data.networkName,
    tokenSymbol: data.tokenSymbol,
    amount: data.amount,
    lockPeriod: data.lockPeriod,
  });

  let result;
  try {
    result = await createDepositByNames(
      'initial-tx-' + v4(),
      data.amount,
      data.walletAddress,
      data.networkName,
      data.tokenSymbol,
      data.lockPeriod,
      data.vaquitaContract,
    );
  } catch (err) {
    childLog.error({ err }, 'createDepositByNames threw');
    return poolErrorResponse(res, err) ?? sendError(res, (err as Error)?.message ?? 'Failed to create deposit', err, 500);
  }

  if (result.error) {
    childLog.error({ err: result.error }, 'Failed to insert deposit');
    return sendError(res, 'Error on inserting deposit', result.error, 500);
  }

  childLog.info({ depositId: result.data?.id }, 'Deposit inserted');
  return sendSuccess(res, result.data, 'success inserted');
}));

router.post('/confirm', asyncHandler(async (req, res) => {
  const { id, txHash, depositIdHex, transactionRaw } = req.body ?? {};
  req.log.info({ id, txHash, depositIdHex }, 'POST /deposit/confirm');

  if (!id || !txHash) {
    req.log.warn({ id, txHash }, 'Missing id or txHash');
    return sendError(res, 'Missing id or txHash', null, 400);
  }

  const result = await confirmDepositWithTx(id, depositIdHex, txHash, transactionRaw);

  if (result.error) {
    req.log.error({ err: result.error, id, txHash }, 'Failed to confirm deposit');
    return sendError(res, 'Error on confirming deposit', result.error, 500);
  }

  req.log.info({ id, txHash }, 'Deposit confirmed');
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/fail', asyncHandler(async (req, res) => {
  const { id, txHash, depositIdHex, transactionRaw } = req.body ?? {};
  req.log.info({ id, txHash, depositIdHex }, 'POST /deposit/fail');

  if (!id) {
    req.log.warn({ id }, 'Missing id');
    return sendError(res, 'Missing id', null, 400);
  }

  const result = await failDepositWithTx(id, depositIdHex, txHash, transactionRaw);

  if (result.error) {
    req.log.error({ err: result.error, id, txHash }, 'Failed to mark deposit as failed');
    return sendError(res, 'Error on failing deposit', result.error, 500);
  }

  req.log.info({ id, txHash }, 'Deposit marked as failed');
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/withdraw', asyncHandler(async (req, res) => {
  const { depositId, txHash, transactionRaw } = req.body ?? {};
  req.log.info({ depositId, txHash }, 'POST /deposit/withdraw');

  if (!depositId) {
    req.log.warn({ depositId }, 'Missing depositId');
    return sendError(res, 'Missing depositId', null, 400);
  }

  const result = await creteWithdrawal({
    depositId,
    transactionHash: txHash,
    transactionEventRaw: transactionRaw,
  });

  if (result.error) {
    req.log.error({ err: result.error, depositId, txHash }, 'Failed to create withdrawal');
    return sendError(res, 'Error inserting withdrawal', result.error, 500);
  }

  req.log.info({ depositId, txHash }, 'Withdrawal created');
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/withdraw-confirm', asyncHandler(async (req, res) => {
  const { depositId, txHash, transactionRaw } = req.body ?? {};
  req.log.info({ depositId, txHash }, 'POST /deposit/withdraw-confirm');

  if (!depositId) {
    req.log.warn({ depositId }, 'Missing depositId');
    return sendError(res, 'Missing depositId', null, 400);
  }

  const result = await creteConfirmWithdrawal({
    depositId,
    transactionHash: txHash,
    transactionEventRaw: transactionRaw,
  });

  if (result.error) {
    req.log.error({ err: result.error, depositId, txHash }, 'Failed to confirm withdrawal');
    return sendError(res, 'Error confirming withdrawal', result.error, 500);
  }

  req.log.info({ depositId, txHash }, 'Withdrawal confirmed');
  return sendSuccess(res, true, 'success confirmed');
}));

router.get('/network/:networkName/wallet/:walletAddress', asyncHandler(async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /deposit/network/:networkName/wallet/:walletAddress');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data, error } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, walletAddress);

  if (error) {
    req.log.error({ err: error, networkId: networkData.id, walletAddress }, 'Failed to fetch deposits');
    return sendError(res, 'error on get deposits', error, 500);
  }

  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data, false, false);
  return sendSuccess(res, response, '');
}));

router.get('/network/:networkName/token/:tokenSymbol/lockPeriod/:lockPeriod/apy', asyncHandler(async (req, res) => {
  const { networkName, tokenSymbol, lockPeriod } = req.params;
  req.log.info({ networkName, tokenSymbol, lockPeriod }, 'GET /deposit/.../apy');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data: tokenData, error: tokenError } = await getTokenBySymbol(tokenSymbol);
  if (tokenError || !tokenData) {
    req.log.error({ err: tokenError, tokenSymbol }, 'Token not found');
    return sendError(res, 'Token not found', tokenError, 404);
  }

  const { data: tokenNetworkData, error: tokenNetworkError } =
    await getTokenNetworkByNetworkIdTokenId(networkData.id, tokenData.id);
  if (tokenNetworkError || !tokenNetworkData) {
    req.log.error(
      { err: tokenNetworkError, networkId: networkData.id, tokenId: tokenData.id },
      'Token on network not found',
    );
    return sendError(res, 'Token on network not found', tokenNetworkError, 404);
  }

  let response: unknown = {};
  if (networkData.name === 'Stellar Testnet' || networkData.name === 'Stellar') {
    // Headline protocolApy: DeFindex HTTP API (+ on-chain period for vaquitaApy). Blend pool reserve is not used:
    // per-deposit vault yield is share/NAV via `getBlendInterest`, and Blend SDK often lags testnet pool storage.
    response = await getStellarApyData(networkData, Number(lockPeriod), null, tokenNetworkData);
  } else if (networkData.name === 'Dummy') {
    response = getDummyApyData(Number(lockPeriod));
  } else {
    req.log.warn({ networkName: networkData.name }, 'No APY provider for network');
  }

  return sendSuccess(res, response, '');
}));

router.get('/network/:networkName/wallet/:walletAddress/complete', asyncHandler(async (req, res) => {
  const { networkName, walletAddress } = req.params;
  req.log.info({ networkName, walletAddress }, 'GET /deposit/.../complete');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data, error } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, walletAddress);

  if (error) {
    req.log.error({ err: error, networkId: networkData.id, walletAddress }, 'Failed to fetch deposits');
    return sendError(res, 'error on get deposits', error, 500);
  }

  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data, false, true);
  return sendSuccess(res, response, '');
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  req.log.info({ id }, 'GET /deposit/:id');

  const tempCache = {};

  const { data: deposit, error: depositError } = await getDepositsById(+id);

  if (depositError || !deposit) {
    req.log.error({ err: depositError, id }, 'Deposit not found');
    return sendError(res, 'Deposit not found', depositError, 404);
  }

  const { data: networkData, error: networkError } = await getNetworkById(deposit.network_id);

  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkId: deposit.network_id }, 'Network not found for deposit');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data: tokenNetworkData, error: tokenNetworkError } =
    await getTokenNetworkByNetworkIdTokenId(deposit.network_id, deposit.token_id);

  if (tokenNetworkError) {
    req.log.error(
      { err: tokenNetworkError, networkId: deposit.network_id, tokenId: deposit.token_id },
      'Failed to fetch token-network for deposit',
    );
    return sendError(res, 'Failed to fetch token-network', tokenNetworkError, 500);
  }

  const depositResponse = await toDepositResponseDTO(deposit, networkData, tokenNetworkData, tempCache);
  return sendSuccess(res, depositResponse, '');
}));

router.get('/admin/network/:networkName/complete', asyncHandler(async (req, res) => {
  const { networkName } = req.params;
  req.log.info({ networkName }, 'GET /deposit/admin/network/:networkName/complete');

  const { data: networkData, error: networkError } = await getNetworkByName(networkName);

  if (networkError || !networkData) {
    req.log.error({ err: networkError, networkName }, 'Network not found');
    return sendError(res, 'Network not found', networkError, 404);
  }

  const { data, error } = await getDepositsByNetworkId(networkData.id);

  if (error) {
    req.log.error({ err: error, networkId: networkData.id }, 'Failed to fetch deposits');
    return sendError(res, 'error on get deposits', error, 500);
  }

  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data, true, true);
  return sendSuccess(res, response, '');
}));

export default router;