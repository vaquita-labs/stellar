export const VAQUITA_KEY_TIMESTAMP = 'vaquita-timestamp';

export const VAQUITA_TIMESTAMP_VALUE = {
  current: typeof localStorage === 'undefined' ? 0 : +(localStorage.getItem(VAQUITA_KEY_TIMESTAMP) || 0),
};
