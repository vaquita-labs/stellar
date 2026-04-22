import { Filter, Sort } from 'mongodb';
import { dbCrud } from 'services/database';
import { CreateEntityDocument, UpdateEntityDocument } from 'types';
import { PoolDepositBaseDocument, PoolDepositDocument } from './types';

const {
  insertOne,
  updateOne,
  findByFilter,
  findOneByFilter,
} = dbCrud<PoolDepositBaseDocument>('pool-deposit');

export const getPoolDeposits = async (
  companyId: string,
  filter: Filter<PoolDepositDocument>,
  sort?: Sort,
): Promise<PoolDepositDocument[]> => findByFilter({ ...filter, companyId }, { sort });

export const createPoolDeposit = async (
  poolDeposit: CreateEntityDocument<PoolDepositBaseDocument>,
) => {
  return await insertOne(null, null, poolDeposit);
};

export const getPoolDepositByDepositId = async (companyId: string, depositId: string): Promise<PoolDepositDocument> => {
  return await findOneByFilter({ depositId, companyId });
};

export const updatePoolDeposit = async (
  id: string,
  doc: UpdateEntityDocument<PoolDepositBaseDocument>,
) => updateOne(id, doc, null);
