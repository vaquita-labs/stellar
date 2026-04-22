import {
  TELEGRAM_JUKI_ERROR_LOGS_CHAT_ID,
  TELEGRAM_JUKI_ERROR_LOGS_CHAT_TOPIC_ID,
  TELEGRAM_JUKI_INFO_LOGS_CHAT_ID,
  TELEGRAM_JUKI_INFO_LOGS_CHAT_TOPIC_ID,
} from 'config/settings';
import { shouldDisplayLog } from 'helpers/log';
import { stringifyObject } from 'helpers/object';
import { LogLevel } from 'types';
import { LogService } from './service';

export const logService = new LogService();

logService.config(
  TELEGRAM_JUKI_INFO_LOGS_CHAT_ID,
  TELEGRAM_JUKI_INFO_LOGS_CHAT_TOPIC_ID,
  TELEGRAM_JUKI_ERROR_LOGS_CHAT_ID,
  TELEGRAM_JUKI_ERROR_LOGS_CHAT_TOPIC_ID,
);

export const log = (logLevel: LogLevel) => (message: string, content?: any) => {
  if (shouldDisplayLog(logLevel)) {
    const title = `[${logLevel}] ${new Date().toISOString()}, ${message}`;
    console.info(`${title}${content ? ': ' + stringifyObject(content, 5) : ''} `);
  }
};
