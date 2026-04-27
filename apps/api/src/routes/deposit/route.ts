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
  getBaseApyData,
  getBlendPoolReserve,
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
    } catch (error) {
      console.error('ERROR!!!', error);
      next(error);
    }
  };

router.post('/', asyncHandler(async (req, res) => {
  
  const { data, success, error } = depositSchema.safeParse(req.body);
  
  if (!success || !data) {
    return sendError(res, 'Payload inválido', error);
  }
  
  let result;
  try {
    result = await createDepositByNames('initial-tx-' + v4(), data.amount, data.walletAddress, data.networkName, data.tokenSymbol, data.lockPeriod, data.vaquitaContract);
  } catch (error) {
    return sendError(res, (error as Error)?.message, error);
  }
  
  console.info('deposit inserted', result);
  
  if (result.error) {
    return sendError(res, 'Error on inserting deposit:', result.error);
  }
  
  return sendSuccess(res, result.data, 'success inserted');
}));

router.post('/confirm', asyncHandler(async (req, res) => {
  
  const { id, txHash, depositIdHex, transactionRaw } = req.body;
  
  const result = await confirmDepositWithTx(id, depositIdHex, txHash, transactionRaw);
  
  console.info('deposit confirmed', result);
  
  if (result.error) {
    console.error('Error on confirming deposit:', result.error.message);
    return sendError(res, 'Error on confirming deposit', result.error);
  }
  
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/fail', asyncHandler(async (req, res) => {
  
  const { id, txHash, depositIdHex, transactionRaw } = req.body;
  
  const result = await failDepositWithTx(id, depositIdHex, txHash, transactionRaw);
  
  console.info('deposit failed', result);
  
  if (result.error) {
    console.error('Error on failing deposit:', result.error.message);
    return sendError(res, 'Error on failing deposit', result.error);
  }
  
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/withdraw', asyncHandler(async (req, res) => {
  
  const { depositId, txHash, transactionRaw } = req.body;
  
  const result = await creteWithdrawal({
    depositId,
    transactionHash: txHash,
    transactionEventRaw: transactionRaw,
  });
  console.info('withdraw created', result);
  
  if (result.error) {
    console.error('Error insertando deposit:', result.error.message);
    return sendError(res, 'Error inserting deposit', result);
  }
  
  return sendSuccess(res, true, 'success confirmed');
}));

router.post('/withdraw-confirm', asyncHandler(async (req, res) => {
  
  const { depositId, txHash, transactionRaw } = req.body;
  
  const result = await creteConfirmWithdrawal({
    depositId,
    transactionHash: txHash,
    transactionEventRaw: transactionRaw,
  });
  console.info('withdraw confirmed', result);
  
  if (result.error) {
    console.error('Error insertando deposit:', result.error.message);
    return sendError(res, 'Error inserting deposit', result);
  }
  
  return sendSuccess(res, true, 'success confirmed');
}));

router.get('/network/:networkName/wallet/:walletAddress', asyncHandler(async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data, error } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, walletAddress);
  
  if (error) {
    return sendError(res, 'error on get deposits', error);
  }
  
  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data, false, false);
  
  // const empty = () => ({
  //   totalCount: 0,
  //   totalAmount: 0,
  // });
  // const totalEmpty = () => ({
  //   [DepositWithdrawalState.NONE]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_PROCESSING]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_SUCCESS]: empty(),
  //   [DepositWithdrawalState.DEPOSIT_FAILED]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_PROCESSING]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_SUCCESS]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY]: empty(),
  //   [DepositWithdrawalState.WITHDRAW_FAILED]: empty(),
  // });
  //
  // const totals: TotalSummaryDepositsResponseDTO = {};
  // for (const deposit of newData) {
  //   if (!totals[deposit.tokenSymbol]) {
  //     totals[deposit.tokenSymbol] = totalEmpty();
  //   }
  //   totals[deposit.tokenSymbol]![deposit.state].totalCount++;
  //   totals[deposit.tokenSymbol]![deposit.state].totalAmount += deposit.amount;
  // }
  sendSuccess(res, response, '');
}));

router.get('/network/:networkName/token/:tokenSymbol/lockPeriod/:lockPeriod/apy', asyncHandler(async (req, res) => {
  
  const { networkName, tokenSymbol, lockPeriod } = req.params;
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data: tokenData, error: tokenError } = await getTokenBySymbol(tokenSymbol);
  if (tokenError || !tokenData) {
    return sendError(res, 'Token not found', tokenError);
  }
  
  const {
    data: tokenNetworkData,
    error: tokenNetworkError,
  } = await getTokenNetworkByNetworkIdTokenId(networkData.id, tokenData.id);
  if (tokenNetworkError || !tokenNetworkData) {
    return sendError(res, 'Token on network not found', tokenNetworkError);
  }
  
  let poolData = null;
  let response = {};
  if (networkData.name === 'Base' || networkData.name === 'Base Sepolia Testnet') {
    response = await getBaseApyData(networkData, tokenNetworkData, Number(lockPeriod));
  } else if (networkData.name === 'Stellar Testnet') {
    poolData = await getBlendPoolReserve(networkData);
    response = await getStellarApyData(networkData, Number(lockPeriod), poolData);
  } else if (networkData.name === 'Dummy') {
    response = getDummyApyData(Number(lockPeriod));
  }
  
  sendSuccess(res, response, '');
}));

router.get('/network/:networkName/wallet/:walletAddress/complete', asyncHandler(async (req, res) => {
  
  const { networkName, walletAddress } = req.params;
  
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data, error } = await getCachedDepositsByNetworkIdWalletAddress(networkData.id, walletAddress);
  
  if (error) {
    return sendError(res, 'error on get deposits', error);
  }
  
  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(
    networkData,
    data,
    false,
    true,
  );
  
  sendSuccess(res, response, '');
}));

router.get('/:id', asyncHandler(async (req, res) => {
  
  const { id } = req.params;
  let tempCache = {};
  
  const { data: deposit, error: depositError } = await getDepositsById(+id);
  
  if (depositError || !deposit) {
    return sendError(res, 'Deposit not found', depositError);
  }
  
  const { data: networkData, error: networkError } = await getNetworkById(deposit.network_id);
  
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data: tokenNetworkData } = await getTokenNetworkByNetworkIdTokenId(deposit.network_id, deposit.token_id);
  
  const depositResponse = await toDepositResponseDTO(deposit, networkData, tokenNetworkData, tempCache);
  
  sendSuccess(res, depositResponse, '');
}));

router.get('/admin/network/:networkName/complete', asyncHandler(async (req, res) => {
  
  const { networkName } = req.params;
  
  const { data: networkData, error: networkError } = await getNetworkByName(networkName);
  
  if (networkError || !networkData) {
    return sendError(res, 'Network not found', networkError);
  }
  
  const { data, error } = await getDepositsByNetworkId(networkData.id);
  
  if (error) {
    return sendError(res, 'error on get deposits', error);
  }
  
  const response = await dataToDepositResponseDTOTotalDepositsResponseDTO(networkData, data, true, true);
  
  sendSuccess(res, response, '');
}));

export default router;
