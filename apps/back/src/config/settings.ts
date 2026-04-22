import { LogLevel } from 'types';

export const JUKI_SECRET_TOKEN = process.env.JUKI_SECRET_TOKEN || '';

export const LOG_LEVEL: LogLevel = process.env.LOG_LEVEL as LogLevel || LogLevel.INFO;

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const VERSION = process.env.VERSION || '0.0.0';
export const ORIGINS = [
  ...(process.env.ORIGINS || '').split(','),
  /^((https:\/\/vaquita\.fi)|(https:\/\/[a-zA-Z0-9\-_]+\.vaquita\.fi))$/,
  /^((https:\/\/ngrok-free\.app)|(https:\/\/[a-zA-Z0-9\-_]+\.ngrok-free\.app))$/,
];
export const PORT = process.env.PORT || 4000;

export const MONGO_DATABASE_URI = process.env.MONGO_DATABASE_URI || '';
export const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME || '';

export const COMPANY_HOSTS = (process.env.COMPANY_HOSTS || '').split(',,').map(hosts => hosts.split(','));

export const TELEGRAM_JUKI_INFO_LOGS_CHAT_ID = process.env.TELEGRAM_JUKI_INFO_LOGS_CHAT_ID || '';
export const TELEGRAM_JUKI_INFO_LOGS_CHAT_TOPIC_ID = process.env.TELEGRAM_JUKI_INFO_LOGS_CHAT_TOPIC_ID || '';
export const TELEGRAM_JUKI_ERROR_LOGS_CHAT_ID = process.env.TELEGRAM_JUKI_ERROR_LOGS_CHAT_ID || '';
export const TELEGRAM_JUKI_ERROR_LOGS_CHAT_TOPIC_ID = process.env.TELEGRAM_JUKI_ERROR_LOGS_CHAT_TOPIC_ID || '';

export const AWS_S3_JUKI_FILES_PUBLIC_BUCKET = process.env.AWS_S3_JUKI_FILES_PUBLIC_BUCKET || '';

export const WITHOUT_AWS_KEYS = !!process.env.WITHOUT_AWS_KEYS;
export const AWS_REGION = process.env.AWS_REGION || '';
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';

export const AWS_SQS_JUKI_CONNECTION_INTERNET_FIFO_URL = process.env.AWS_SQS_JUKI_CONNECTION_INTERNET_FIFO_URL || '';
export const TELEGRAM_JUKI_LOGS_BOT_TOKEN = process.env.TELEGRAM_JUKI_LOGS_BOT_TOKEN || '';
