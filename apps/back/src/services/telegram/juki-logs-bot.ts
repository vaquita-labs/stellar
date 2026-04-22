import { TELEGRAM_JUKI_LOGS_BOT_TOKEN } from 'config/settings';
import { fetcherType, TelegramBotService } from './telegram-bot.service';

const getFetcher: fetcherType = (url: string, options) => fetch(url, { body: options?.body, method: options?.method });

export const jukiLogsBot = new TelegramBotService(getFetcher);

jukiLogsBot.config(TELEGRAM_JUKI_LOGS_BOT_TOKEN);
