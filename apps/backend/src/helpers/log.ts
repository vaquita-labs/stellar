import { LOG_LEVEL } from 'config/settings';
import { LogLevel } from 'types';

const SHOULD_DISPLAY_LOG: { [key in LogLevel]: { [key in LogLevel]: boolean } } = {
  [LogLevel.FATAL]: {
    FATAL: true,
    ERROR: false,
    WARN: false,
    INFO: false,
    DEBUG: false,
    TRACE: false,
  },
  [LogLevel.ERROR]: {
    FATAL: true,
    ERROR: true,
    WARN: false,
    INFO: false,
    DEBUG: false,
    TRACE: false,
  },
  [LogLevel.WARN]: {
    FATAL: true,
    ERROR: true,
    WARN: true,
    INFO: false,
    DEBUG: false,
    TRACE: false,
  },
  [LogLevel.INFO]: {
    FATAL: true,
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: false,
    TRACE: false,
  },
  [LogLevel.DEBUG]: {
    FATAL: true,
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
    TRACE: false,
  },
  [LogLevel.TRACE]: {
    FATAL: true,
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
    TRACE: true,
  },
};

export const shouldDisplayLog = (logLevel: LogLevel) => {
  return SHOULD_DISPLAY_LOG[LOG_LEVEL]?.[logLevel] ?? false;
};
