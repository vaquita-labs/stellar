import { GroupPeriod } from 'app/group/types';
import { createPoolDeposit, getPoolDepositByDepositId, getPoolDeposits, updatePoolDeposit } from 'app/pool/services';
import { DepositPoolStatus, GroupCrypto, PoolDepositBaseDocument, PoolDepositDocument } from 'app/pool/types';
import { logService } from 'services/log';
import { JkRequest, JkResponse, NextFunction } from 'types';

export const getAllDeposits = async (req: JkRequest, res: JkResponse, next: NextFunction) => {
  
  const contents: {}[] = [];
  
  res.sendContents(contents, { page: 0, size: 0, sort: [], totalElements: contents.length });
};

export const postScrollTransactionsDeposit = async (req: JkRequest, res: JkResponse, next: NextFunction) => {
  
  await logService.sendInfoMessage('postScrollTransactionsDeposit start', {
    body: req.body, headers: req.headers, params: req.params,
  });
  
  const transactionHash = req.body?.event?.data?.block?.logs?.[0]?.transaction?.hash;
  const timestamp = Number(req.body?.event?.data?.block?.timestamp ?? 0);
  const amount = BigInt(req.body?.event?.data?.block?.logs?.[0]?.data ?? 0).toString();
  const depositId = req.body?.event?.data?.block?.logs?.[0]?.topics?.[1] ?? '';
  const customerPublicKey = req.body?.event?.data?.block?.logs?.[0]?.transaction?.from?.address ?? '';
  const contractAddress = req.body?.event?.data?.block?.logs?.[0]?.account?.address ?? '';
  
  const poolDeposit: PoolDepositBaseDocument = {
    companyId: '',
    transactionHash,
    timestamp,
    amount,
    depositId,
    customerPublicKey,
    crypto: GroupCrypto.USDC,
    status: DepositPoolStatus.ACTIVE,
    event: req.body?.event,
    contractAddress,
    rewardWithdrawn: '0',
    amountWithdrawn: '0',
  };
  
  await createPoolDeposit(poolDeposit);
  
  res.sendContent(true);
};

function splitInHalf(str: string): [ string, string ] {
  const mid = Math.floor(str.length / 2);
  const firstHalf = str.slice(0, mid);
  const secondHalf = str.slice(mid);
  return [ firstHalf, secondHalf ];
}

export const postScrollTransactionsWithdraw = async (req: JkRequest, res: JkResponse, next: NextFunction) => {
  
  await logService.sendInfoMessage('postScrollTransactionsWithdraw start', {
    body: req.body, headers: req.headers, params: req.params,
  });
  
  const depositId = req.body?.event?.data?.block?.logs?.[0]?.topics?.[1] ?? '';
  const [ amount, reward ] = splitInHalf((req.body?.event?.data?.block?.logs?.[0]?.data + '').replace('0x', ''));
  const amountWithdrawn = BigInt(`0x${amount}`).toString();
  const rewardWithdrawn = BigInt(`0x${reward}`).toString();
  
  const poolDeposit = await getPoolDepositByDepositId('', depositId);
  await updatePoolDeposit(poolDeposit._id.toString(), {
    amountWithdrawn,
    rewardWithdrawn,
    status: DepositPoolStatus.CONCLUDED,
  });
  
  res.sendContent(true);
};

export const getData = async (req: JkRequest, res: JkResponse, next: NextFunction) => {
  
  const { contractAddress, customerPublicKey } = req.query as { contractAddress: string, customerPublicKey: string };
  
  const poolDeposits = await getPoolDeposits('', { contractAddress });
  
  const volumePool = poolDeposits.reduce((total, { amount, depositId, amountWithdrawn }) => {
    return total + (BigInt(amount) - BigInt(amountWithdrawn));
  }, 0n);
  
  const rewardPool = volumePool / BigInt(33);
  
  const myDeposits = poolDeposits.filter((poolDeposit) => poolDeposit.customerPublicKey === customerPublicKey);
  
  const depositsByCustomer: { [key: string]: PoolDepositDocument } = {};
  
  poolDeposits.forEach((poolDeposit) => {
    depositsByCustomer[poolDeposit.customerPublicKey] = poolDeposit;
  });
  
  res.sendContent({
    volumePool: volumePool.toString(),
    rewardPool: rewardPool.toString(),
    period: GroupPeriod.MONTHLY,
    name: '6 months',
    // test
    crypto: contractAddress === '0x882dc06eb03019e38ae4136a62f57e0e8315c392' ? GroupCrypto.WLD : GroupCrypto.USDC,
    rounds: 6,
    participants: Object.keys(depositsByCustomer).length,
    startsOnTimestamp: new Date(2025, 2, 21).getTime(),
    myDeposits: myDeposits.map(({ event, ...deposit }) => ({
      ...deposit,
    })),
  });
};
