import { GroupWithdrawalType } from 'app/group/types';

export {
  RUNNER_ACCEPTED_PROGRAMMING_LANGUAGES,
  RUNNER_ACCEPTED_PROBLEM_MODES,
  RUNNER_ACCEPTED_PROBLEM_TYPES,
  PROGRAMMING_LANGUAGE,
  SUBMISSION_RUN_STATUS,
  PROBLEM_VERDICT,
  ERROR,
  JUDGE,
  YEARS,
  MAX_DATE,
  MIN_DATE,
  JUKI_APP_COMPANY_KEY,
  EMPTY_USER_PERMISSIONS,
  SEPARATOR_TOKEN,
} from '@juki-team/commons';

export const DEFAULT_PAGE = 1;
export const DEFAULT_SIZE = 32;

export const ONE_MINUTE = 1000 * 60;
export const ONE_HOUR = ONE_MINUTE * 60;
export const ONE_DAY = ONE_HOUR * 24;

export const MAX_STRING_LENGTH = 100000;

export const EMPTY_WITHDRAWALS_DOCUMENT = {
  [GroupWithdrawalType.COLLATERAL]: {
    amount: 0,
    type: GroupWithdrawalType.COLLATERAL,
    timestamp: 0,
    transactionSignature: '',
  },
  [GroupWithdrawalType.ROUND]: {
    amount: 0,
    type: GroupWithdrawalType.ROUND,
    timestamp: 0,
    transactionSignature: '',
  },
  [GroupWithdrawalType.INTEREST]: {
    amount: 0,
    type: GroupWithdrawalType.INTEREST,
    timestamp: 0,
    transactionSignature: '',
  },
};
