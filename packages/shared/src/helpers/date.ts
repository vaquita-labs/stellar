import { ONE_DAY } from '../config/constants';

export const getCurrentDay = (date: Date) => {
  return Math.ceil(date.getTime() / ONE_DAY);
};
