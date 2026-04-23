import { APIGatewayProxyResult } from 'aws-lambda';
import { errorsResponse } from 'helpers/commons';
import { log, logService } from 'services/log';
import { LogLevel } from 'types';
import { isOriginValid } from './cors';
import { shouldDisplayLog } from './log';

export const logD = (title: string, content?: any) => {
  log(shouldDisplayLog(LogLevel.TRACE) ? LogLevel.TRACE : LogLevel.DEBUG)(title, shouldDisplayLog(LogLevel.TRACE) ? content : undefined);
};

export const logI = (title: string, content?: any) => {
  log(shouldDisplayLog(LogLevel.DEBUG) ? LogLevel.DEBUG : LogLevel.INFO)(title, shouldDisplayLog(LogLevel.DEBUG) ? content : undefined);
};

export const logLambdaHandler = async (event: any, context: any, name: string, upDate: Date, handler: (event: any, context: any) => Promise<any>, onError?: (error: any) => void) => {
  const runDateTimestamp = Date.now();
  const awsRequestId = context.awsRequestId;
  logI(`"${name}" started, awsRequestId: "${awsRequestId}", after: "${runDateTimestamp - upDate.getTime()}"`, { event });
  log(LogLevel.DEBUG)('logLambdaHandler', { event, context, name });
  try {
    
    const result = await handler(event, context);
    if (shouldDisplayLog(LogLevel.DEBUG)) {
      log(LogLevel.DEBUG)(`"${name}" completed, duration: "${Date.now() - runDateTimestamp}", awsRequestId: "${awsRequestId}"`, result);
    } else {
      log(LogLevel.INFO)(`"${name}" completed, duration: "${Date.now() - runDateTimestamp}", awsRequestId: "${awsRequestId}"`);
    }
    
    return result;
  } catch (error: any) {
    const title = `"${name}" failed, duration: "${Date.now() - runDateTimestamp}", awsRequestId: "${awsRequestId}"`;
    await logService.sendErrorMessage(title, error);
    log(LogLevel.ERROR)(title, {
      error,
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    
    return onError?.(error) ?? false;
  }
};

export const logApiLambdaHandler = async <T, >(event: any, context: any, name: string, upDate: Date, handler: () => Promise<any>, onError?: (error: any) => void) => {
  return await logLambdaHandler(event, context, name, upDate, async (): Promise<APIGatewayProxyResult> => {
    log(LogLevel.DEBUG)('event', event);
    const origin = event.headers.origin;
    const XAlchemySignature = event.headers['X-Alchemy-Signature'] ?? event.headers['x-alchemy-signature'];
    if (!isOriginValid(origin) && !XAlchemySignature && false) {
      log(LogLevel.WARN)(`not valid origin: "${origin}", XAlchemySignature: "${XAlchemySignature}"`);
      const response = {
        statusCode: 403,
        body: JSON.stringify(errorsResponse('unknown origin')),
      };
      await logService.sendErrorMessage('unknown origin', { origin, XAlchemySignature });
      
      log(LogLevel.DEBUG)('the following response was sent', response);
      return response;
    }
    
    const headers = {
      ['Access-Control-Allow-Credentials']: 'true',
      ['Access-Control-Allow-Origin']: XAlchemySignature ? '*' : origin,
      ['Access-Control-Allow-Methods']: event.httpMethod,
      ['Access-Control-Allow-Headers']: 'Content-Type, Authorization',
    };
    
    // if (event.httpMethod === 'POST' && !isStringJson(event.body)) {
    //   log(LogLevel.WARN)(`not valid body: "${JSON.stringify(event.body)}`);
    //   const response = {
    //     statusCode: 400,
    //     headers,
    //     body: JSON.stringify(errorsResponse('not valid body')),
    //   };
    //   log(LogLevel.DEBUG)('the following response was sent', response);
    //   return response;
    // }
    
    const result = await handler();
    
    const response = {
      ...result,
      headers,
    };
    
    log(LogLevel.DEBUG)('the following response was sent', response);
    return response;
  }, onError);
};
