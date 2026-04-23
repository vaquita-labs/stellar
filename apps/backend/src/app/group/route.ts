import { safeResponse } from 'helpers';
import type { API } from 'types';
import {
  __setTimestampGroup,
  archiveGroup,
  getAllGroups,
  getGroupData,
  postCreateGroup,
  postDepositGroup,
  postDisjoinGroup,
  postEnrollGroup,
  postJoinGroup,
  postScrollRegisterDeposit,
  postScrollRegisterWithdraw,
  postSetPosition,
  postWithdrawal,
} from './controller';

export default (api: API) => {
  
  api.get('/', safeResponse(getAllGroups));
  api.post('/create', safeResponse(postCreateGroup));
  
  api.get('/:id', safeResponse(getGroupData));
  api.delete('/:id', safeResponse(archiveGroup));
  api.post('/:id/deposit', safeResponse(postDepositGroup));
  api.post('/:id/disjoin', safeResponse(postDisjoinGroup));
  api.post('/:id/join', safeResponse(postJoinGroup));
  api.post('/:id/enroll', safeResponse(postEnrollGroup));
  api.post('/:id/withdrawal', safeResponse(postWithdrawal));
  api.post('/set-position', safeResponse(postSetPosition));
  api.post('/scroll/register-deposit', safeResponse(postScrollRegisterDeposit));
  api.post('/scroll/register-withdraw', safeResponse(postScrollRegisterWithdraw));
  
  api.post('/:id/set-timestamp', safeResponse(__setTimestampGroup));
  
}
