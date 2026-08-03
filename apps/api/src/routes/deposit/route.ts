import { type NextFunction, type Request, type RequestHandler, type Response, Router } from 'express';
import { v4 } from 'uuid';
import {
  confirmDepositWithTx,
  countOpenPositionsByLockPeriod,
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
  getNextDepositNonce,
  getNetworkById,
  getNetworkByName,
  getStellarApyData,
  getTokenBySymbol,
  getVaultApy,
  getTokenNetworkByNetworkIdTokenId,
  MIN_USDC_AMOUNT,
  sendError,
  sendSuccess,
  verifyTxSucceeded,
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
      data.nonce,
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

  // A deposit row marked confirmed is the position the user sees and withdraws
  // against, so the transaction has to have landed. Anything short of SUCCESS
  // leaves the row untouched — the client can retry, or mark it failed.
  const verdict = await verifyTxSucceeded(txHash);
  if (verdict !== 'SUCCESS') {
    req.log.warn({ id, txHash, verdict }, 'Deposit transaction not confirmed on chain');
    return sendError(res, 'Deposit transaction is not confirmed on chain', { verdict }, 409);
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

  // Mínimo 1 USDC: no se retira una posición por debajo del mínimo (mismo piso que
  // el depósito). El retiro saca la posición entera, así que validamos su monto.
  const { data: positionToWithdraw } = await getDepositsById(Number(depositId));
  if (positionToWithdraw && positionToWithdraw.amount < MIN_USDC_AMOUNT) {
    req.log.warn(
      { depositId, amount: positionToWithdraw.amount },
      'Withdrawal below minimum',
    );
    return sendError(res, `El retiro mínimo es ${MIN_USDC_AMOUNT} USDC`, null, 400);
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

  let response: Record<string, unknown> = {};
  if (networkData.name === 'Stellar Testnet' || networkData.name === 'Stellar') {
    // Headline protocolApy: DeFindex HTTP API (+ on-chain period for vaquitaApy).
    // Locked funds are forwarded to the DeFindex vault by the pool contract, so the
    // vault's own APY is the rate that describes them; per-deposit yield is the
    // share/NAV read in `getBlendInterest`.
    response = await getStellarApyData(networkData, Number(lockPeriod), tokenNetworkData);
  } else if (networkData.name === 'Dummy') {
    response = getDummyApyData(Number(lockPeriod));
  } else {
    req.log.warn({ networkName: networkData.name }, 'No APY provider for network');
  }

  // Social-proof numbers the portfolio shows instead of the (misleading) APY:
  // reward pool comes from the payload above; open-position count is DB-derived.
  response.openPositions = await countOpenPositionsByLockPeriod(Number(lockPeriod));

  return sendSuccess(res, response, '');
}));

// The flexible (no-lock) position's rate. It sits in the same DeFindex vault the
// pool forwards locked funds into, so this is the per-term endpoint's protocolApy
// without the on-chain period read that only a lock period has.
router.get('/network/:networkName/token/:tokenSymbol/vault/apy', asyncHandler(async (req, res) => {
  const { networkName, tokenSymbol } = req.params;
  req.log.info({ networkName, tokenSymbol }, 'GET /deposit/.../vault/apy');

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

  if (networkData.name !== 'Stellar Testnet' && networkData.name !== 'Stellar') {
    req.log.warn({ networkName: networkData.name }, 'No vault APY provider for network');
    return sendSuccess(res, { protocolApy: 0, lendingMarketName: '' }, '');
  }

  return sendSuccess(res, await getVaultApy(networkData, tokenNetworkData), '');
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

router.get('/next-nonce/wallet/:walletAddress', asyncHandler(async (req, res) => {
  const { walletAddress } = req.params;
  req.log.info({ walletAddress }, 'GET /deposit/next-nonce/wallet/:walletAddress');

  if (!walletAddress) {
    return sendError(res, 'Missing walletAddress', null, 400);
  }

  const { data, error } = await getNextDepositNonce(walletAddress);
  if (error || !data) {
    req.log.error({ err: error, walletAddress }, 'Failed to compute next deposit nonce');
    return sendError(res, 'Failed to compute next nonce', error, 500);
  }

  // { nonce: "<u64 as string>" }
  return sendSuccess(res, data, '');
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