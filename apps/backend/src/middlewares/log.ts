import { Middleware } from 'lambda-api';
import { log } from 'services/log';
import { LogLevel } from 'types';

let nRequest = 0;

const nextNRequest = (): number => {
  nRequest++;
  return nRequest;
};

export const loggerAllRequestHandler: Middleware<{}> = async (request, response, next) => {
  const { rawHeaders, method, path, body, params } = request;
  // const { remoteAddress, remoteFamily } = socket;
  
  const data = {
    timestamp: Date.now(),
    rawHeaders,
    // httpVersion,
    method,
    // remoteAddress,
    // remoteFamily,
    // url,
    path,
    body,
    params,
  };
  // const requestStart = Date.now();
  const no = nextNRequest().padStart(5);
  const methodString = method.padStart(5, ' ');
  log(LogLevel.DEBUG)(`[request: ${no}] ${methodString}: ${path}`, data);
  next();
  // await next();
  // log(LogLevel.DEBUG)(`[request: ${no}] ${path} [${Date.now() - requestStart}]`);
};

export const loggerRequestTimeHandler: Middleware<{}> = async (request, response, next) => {
  const { path, method } = request;
  // const requestStart = Date.now();
  const no = nextNRequest().padStart(5);
  const methodString = method.padStart(7, ' ');
  log(LogLevel.INFO)(`[request: ${no}] ${methodString}: ${path}`);
  next();
  // await next();
  // log(LogLevel.INFO)(`[request: ${no}] ${path} [${Date.now() - requestStart}]`);
};
