import { ERROR, ErrorCode, errorsResponse, JkError } from '@juki-team/commons';
import { getRequestData } from 'helpers';
import { logService } from 'services/log';
import { JkResponse, NextFunction, Request, Response } from 'types';

/*
 https://github.com/visionmedia/supertest/issues/416
 
 Error-handling middleware always takes four arguments.
 You must provide four arguments to identify it as an error-handling middleware function.
 Even if you don’t need to use the next object, you must specify it to maintain the signature.
 Otherwise, the next object will be interpreted as regular middleware and will fail to handle errors.
 */

export async function errorLoggerHandler(err: any, request: Request, response: Response, next: NextFunction) {
  const { headers, method, path, body, params } = request;
  const error = {
    headers,
    method,
    path,
    body,
    params,
    error: err.stack,
  };
  await logService.sendErrorMessage(`Logging error [[${path}]]`, error, getRequestData(request));
  next();
}

export function failSafeHandler(err: any, request: Request, response: Response, next: NextFunction) {
  response
    .status(500)
    .send(errorsResponse(
      err?.message || ERROR[ErrorCode.ERR500].message,
      new JkError(ErrorCode.ERR500, { message: err?.message, stack: err?.stack }),
    ));
}

export function notFoundResponse(req: Request, res: JkResponse, next: NextFunction) {
  res.sendError(new JkError(ErrorCode.ERR404));
}
