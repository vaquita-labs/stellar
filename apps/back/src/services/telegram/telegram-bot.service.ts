import { log } from 'services/log';
import { LogLevel } from 'types';

type fetcherOptionsType = { body?: string | FormData, method?: 'POST' | 'GET' };

export type fetcherType = (url: string, options?: fetcherOptionsType) => Promise<Response>

export class TelegramBotService {
  _JUKI_LOGS_BOT_TOKEN: string = '';
  _fetcher: fetcherType;
  
  constructor(fetcher: fetcherType) {
    this._fetcher = fetcher;
  }
  
  config(jukiLogsBotToken: string, fetcher?: fetcherType) {
    this._JUKI_LOGS_BOT_TOKEN = jukiLogsBotToken;
    if (fetcher) {
      this._fetcher = fetcher;
    }
  }
  
  send(partialUrl: string, formData?: FormData) {
    if (!this._JUKI_LOGS_BOT_TOKEN) {
      return log(LogLevel.ERROR)('PLEASE SET UP THE \'TelegramBotService\'');
    }
    
    log(LogLevel.TRACE)('sending Telegram log');
    
    const url = `https://api.telegram.org/bot${this._JUKI_LOGS_BOT_TOKEN}/${partialUrl}`;
    
    return this._fetcher(url, formData ? { body: formData, method: 'POST' } : {})
      .then(response => response.json())
      .then(response => {
        if (response.ok) {
          log(LogLevel.TRACE)('telegram message sent ' + url);
          return;
        }
        throw response;
      })
      .catch(error => {
        if (error.response) {
          log(LogLevel.WARN)(
            'error on sending telegram message',
            {
              error,
              data: error.response.data,
              status: error.response.status,
              headers: error.response.headers,
              partialUrl,
              url,
              possibleError: 'The request was made and the server responded with a status code, that falls out of the range of 2xx',
            },
          );
          
        } else if (error.request) {
          log(LogLevel.WARN)(
            'error on sending telegram message',
            {
              error,
              request: error.request,
              partialUrl, url,
              possibleError: 'The request was made but no response was received `error.request` is an instance of XMLHttpRequest in the browser and an instance of http.ClientRequest in node.js',
            },
          );
        } else {
          log(LogLevel.WARN)(
            'error on sending telegram message',
            {
              error,
              message: error?.message,
              partialUrl, url,
              possibleError: 'Something happened in setting up the request that triggered an Error',
            },
          );
        }
      });
  }
  
  sendMessage(text: string, chatId: string, messageThreadId: string) {
    return this.send(`sendMessage?chat_id=${chatId}&message_thread_id=${messageThreadId}&text=${text}&parse_mode=MarkdownV2`);
  }
}
