import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data?: T, message?: string) {
  return res.json({
    status: 'success',
    message,
    data,
  });
}

export function sendError(res: Response, message: string, errors?: any, code = 400) {
  return res.status(code).json({
    status: 'error',
    message,
    errors,
  });
}
