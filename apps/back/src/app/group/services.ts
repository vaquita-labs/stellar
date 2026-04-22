import { Filter, Sort } from 'mongodb';
import { dbCrud } from 'services/database';
import { log } from 'services/log';
import { CreateEntityDocument, ErrorCode, JkError, LogLevel, UpdateEntityDocument } from 'types';
import { GroupBaseDocument, GroupDocument } from './types';

const { findOne, insertOne, deleteOne, updateOne, findByFilter } = dbCrud<GroupBaseDocument>('group');

export const getGroups = async (
  companyId: string,
  filter: Filter<GroupDocument>,
  sort?: Sort,
): Promise<GroupDocument[]> => findByFilter({ ...filter, companyId }, { sort });

export const createGroup = async (
  contest: CreateEntityDocument<GroupBaseDocument>,
) => {
  return await insertOne(null, null, contest);
};

export const getGroup = async (companyId: string, id: string): Promise<GroupDocument> => {
  const group = await findOne(id);
  if (group.companyId !== companyId) {
    log(LogLevel.INFO)(JSON.stringify({ groupId: id, companyId }), 'error on getGroupData');
    throw new JkError(ErrorCode.ERR0211, { message: 'not found' });
  }
  return group;
};

export const updateGroup = async (
  id: string,
  doc: UpdateEntityDocument<GroupDocument>,
) => updateOne(id, doc, null);

export const deleteGroup = async (id: string) => deleteOne(id, null);
