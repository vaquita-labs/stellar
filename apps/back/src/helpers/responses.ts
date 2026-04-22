import { ERROR } from 'config/constants';
import type { IncomingHttpHeaders } from 'http';
import { ParsedQs } from 'qs';
import { logService } from 'services/log';
import { ContentsMetaType, ErrorCode, JkError, Request, Response, ResponseOptionsType } from 'types';
import { contentResponse, contentsResponse, errorsResponse } from './commons';

export interface RequestType {
  method: string,
  originalUrl: string,
  baseUrl: string,
  path: string,
  query: ParsedQs,
  headers: IncomingHttpHeaders,
  body: string
}

export const getRequestData = (request: RequestType | Request) => {
  return {
    method: request?.method,
    path: request?.path,
    query: request?.query,
    headers: request?.headers,
    body: request?.body,
  };
};

export const responseError = (request: Request, response: Response) => async (error: JkError, options?: ResponseOptionsType, ...restErrors: JkError[]) => {
  
  const { message: _message, status: _status } = options || {};
  let { notify } = options || {};
  
  const errors = [ error, ...restErrors ];
  
  if (errors.some(error => error.code === ErrorCode.ERR500 || !ERROR[error.code] || ERROR[error.code]?.status >= 500 || ERROR[error.code]?.status < 400)) {
    notify = true;
  }
  
  const message = _message || error.message;
  const status = _status || ERROR[error.code].status;
  
  if (notify) {
    await logService.sendErrorMessage(`${status}: ${message}`, errors, getRequestData(request));
  }
  
  if (!response.responseSent) {
    response.responseSent = true;
    return response.status(status).send(errorsResponse(message, ...errors));
  }
};

export const responseContents = (request: Request, response: Response) => async <T, >(contents: T[], meta: ContentsMetaType, options?: ResponseOptionsType) => {
  
  const { message: _message, status: _status, notify } = options || {};
  
  const message = _message || 'OK';
  const status = _status || 200;
  
  if (notify) {
    await logService.sendInfoMessage(`${status}: ${message}`, {
      contents,
      meta,
      request: getRequestData(request),
    });
  }
  
  response.responseSent = true;
  return response.status(status).send(contentsResponse(message, contents, meta));
};

export const responseContent = (request: Request, response: Response) => async <T, >(content: T, options?: ResponseOptionsType) => {
  
  const { message: _message, status: _status, notify } = options || {};
  
  const message = _message || 'OK';
  const status = _status || 200;
  
  if (notify) {
    await logService.sendInfoMessage(`${status}: ${message}`, { content, request: getRequestData(request) });
  }
  
  response.responseSent = true;
  return response.status(status).send(contentResponse(message, content));
};
