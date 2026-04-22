import { ORIGINS } from 'config/settings';

export function isOriginValid(originToCheck: string) {
  return ORIGINS.some(origin => {
    if (typeof origin === 'string') {
      return origin === originToCheck;
    }
    return origin.test(originToCheck);
  });
}
