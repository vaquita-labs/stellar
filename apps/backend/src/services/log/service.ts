import { chunkString } from 'helpers/commons';
import { shouldDisplayLog } from 'helpers/log';
import { stringifyObject } from 'helpers/object';
import { uploadTempPublicFile } from 'services/aws/s3';
import { jukiLogsBot } from 'services/telegram/juki-logs-bot';
import { LogLevel } from 'types';

const log = (logLevel: LogLevel) => (message: string, content?: any) => {
  if (shouldDisplayLog(logLevel)) {
    const title = `[${logLevel}] ${new Date().toISOString()}, ${message}`;
    console.info(`${title}${content ? ': ' + stringifyObject(content, 5) : ''} `);
  }
};

export class LogService {
  _JUKI_INFO_LOGS_CHAT_ID: string = '';
  _JUKI_INFO_LOGS_CHAT_TOPIC_ID: string = '';
  _JUKI_ERROR_LOGS_CHAT_ID: string = '';
  _JUKI_ERROR_LOGS_CHAT_TOPIC_ID: string = '';
  _HEADER?: string;
  // The maximum length of a Telegram message is 4096 characters and it must be UTF-8 encoded.
  readonly maxSizeText = 1024;
  
  constructor() {
  }
  
  config(jukiInfoLogsChatId: string, jukiInfoLogsChatTopicId: string, jukiErrorLogsChatId: string, jukiErrorLogsChatTopicId: string) {
    this._JUKI_INFO_LOGS_CHAT_ID = jukiInfoLogsChatId;
    this._JUKI_INFO_LOGS_CHAT_TOPIC_ID = jukiInfoLogsChatTopicId;
    this._JUKI_ERROR_LOGS_CHAT_ID = jukiErrorLogsChatId;
    this._JUKI_ERROR_LOGS_CHAT_TOPIC_ID = jukiErrorLogsChatTopicId;
  }
  
  setHeader(header: string) {
    this._HEADER = header;
  }
  
  // https://core.telegram.org/bots/api#markdownv2-style
  escape(text: string): string {
    if (typeof text !== 'string') {
      return '__NO_STRING__';
    }
    return text
      .split('_').join('\\_')
      .split('*').join('\\*')
      .split('[').join('\\[')
      .split(']').join('\\]')
      .split('(').join('\\(')
      .split(')').join('\\)')
      .split('~').join('\\~')
      .split('`').join('\\`')
      .split('>').join('\\>')
      .split('#').join('\\#')
      .split('+').join('\\+')
      .split('-').join('\\-')
      .split('=').join('\\=')
      .split('|').join('\\|')
      .split('{').join('\\{')
      .split('}').join('\\}')
      .split('.').join('\\.')
      .split('!').join('\\!');
  }
  
  async sendMessage(markdownV2Text: string, chatId: string, messageThreadId: string) {
    await jukiLogsBot.sendMessage(markdownV2Text, chatId, messageThreadId);
  }
  
  getTitle(title: string) {
    return `${this.escape(this._HEADER + ':')} *${this.escape(title)}*`;
  }
  
  async sendMessages(messages: string[], chatId: string, messageThreadId: string) {
    const results = [];
    for (let i = 0; i < messages.length; i++) {
      results.push(await this.sendMessage(
        messages[i]
        + (messages.length > 1
          ? this.escape(`\n${i + 1} / ${messages.length} [${messages[i].length} / ${this.maxSizeText}]`)
          : '')
        , chatId,
        messageThreadId,
      ));
    }
    return results;
  }
  
  async sendErrorMessage(title: string, error: any, requestData?: any) {
    log(LogLevel.INFO)(`ERROR: sending error message "${title}"`, error);
    const errorText = stringifyObject(error, 5);
    const requestText = stringifyObject(requestData, 5);
    const errorTextChunked = chunkString(errorText, this.maxSizeText);
    
    const messages = errorTextChunked.map(errorText => (
      [
        this.getTitle(title),
        '```json',
        this.escape(errorText),
        '```',
        ...(requestData !== undefined
          ? [
            '*REQUEST*',
            '```json',
            this.escape(requestText),
            '```',
          ]
          : []),
      ].join('\n')
    ));
    
    if (messages.length > 1) {
      const { url } = await uploadTempPublicFile({
        body: [
          this.getTitle(title),
          '```json',
          errorText,
          '```',
          ...(requestData !== undefined
            ? [
              '*REQUEST*',
              '```json',
              requestText,
              '```',
            ]
            : []),
        ].join('\n'),
      });
      const contentText = `\nlog too long for a message, url of file where log is displayed: ${url}`;
      return await this.sendMessages([
          [
            this.getTitle(title),
            this.escape(contentText),
          ].join('\n'),
        ],
        this._JUKI_ERROR_LOGS_CHAT_ID,
        this._JUKI_ERROR_LOGS_CHAT_TOPIC_ID);
    } else {
      return await this.sendMessages(messages, this._JUKI_ERROR_LOGS_CHAT_ID, this._JUKI_ERROR_LOGS_CHAT_TOPIC_ID);
    }
  }
  
  toText(content: any) {
    let contentText = '';
    
    if (typeof content === 'object' && content !== null) {
      Object.entries(content).forEach(([ key, value ]) => {
        contentText += `\n*${this.escape(key + ':')}* `
          + `${(Array.isArray(value) ? value : [ value ]).map(v => '`' + this.escape(v instanceof RegExp ? v.toString() : JSON.stringify(v)) + '`').join(', ')}`;
      });
    } else {
      contentText = `${content}`;
    }
    
    return contentText;
  }
  
  async sendInfoMessage(title: string, content: any, text?: boolean) {
    log(LogLevel.INFO)(`INFO: sending info message "${title}"`, content);
    let contentText = stringifyObject(content, 10);
    if (text) {
      contentText = this.toText(content);
    }
    const contentTextChunked = chunkString(contentText, this.maxSizeText);
    const messages = contentTextChunked.map(contentText => (
      [
        this.getTitle(title),
        ...(text
            ? [ contentText ]
            : [ '```json', this.escape(contentText), '```' ]
        ),
      ].join('\n')
    ));
    
    if (messages.length > 1) {
      const { url } = await uploadTempPublicFile({
        body: [
          this.getTitle(title),
          ...(text
              ? [ contentText ]
              : [ '```json', contentText, '```' ]
          ),
        ].join('\n'),
      });
      contentText = `\nlog too long for a message, url of file where log is displayed: ${url}`;
      return await this.sendMessages([
          [
            this.getTitle(title),
            this.escape(contentText),
          ].join('\n'),
        ],
        this._JUKI_INFO_LOGS_CHAT_ID,
        this._JUKI_INFO_LOGS_CHAT_TOPIC_ID);
    } else {
      return await this.sendMessages(messages, this._JUKI_INFO_LOGS_CHAT_ID, this._JUKI_INFO_LOGS_CHAT_TOPIC_ID);
    }
  }
}
