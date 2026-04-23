import { ClassConstructor, classToPlain, plainToClass } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_SIZE, ERROR } from 'config/constants';
import { log } from 'services/log';
import { ErrorCode, JkError, JkRequest, JkResponse, LogLevel, NextFunction, Request, SortType } from 'types';
import { toJkError } from './commons';

export const validatePaginated = (req: Request) => {
  const { pageSize: _size = DEFAULT_SIZE, page: _page = DEFAULT_PAGE } = req.query;
  const size = +_size;
  const page = +_page;
  if (Number.isNaN(page)) {
    throw new JkError(ErrorCode.ERR400, { message: 'invalid page query param' });
  }
  if (Number.isNaN(size)) {
    throw new JkError(ErrorCode.ERR400, { message: 'invalid size query param' });
  }
  return { size, page };
};

export const safeResponse = <T extends Request['params'] = {}, U extends Request['query'] = {}>(callback: (req: JkRequest<T, U>, res: JkResponse, next: NextFunction) => void) => async (req: Request<T>, res: JkResponse, next: NextFunction) => {
  try {
    await callback(req as JkRequest<T, U>, res, next);
  } catch (error) {
    log(LogLevel.ERROR)('safeResponse', { error });
    return res.sendError(toJkError(error));
  }
};

const getErrors = (errors: ValidationError[]) => {
  const allErrors: ValidationError[] = [];
  errors.forEach(error => {
    const errors = getErrors(error.children || []);
    if (error.constraints) {
      allErrors.push(error);
    }
    allErrors.push(...errors);
  });
  return allErrors;
};

export const validPayloadErrors = (errors: ValidationError[], response: JkResponse) => {
  const jkErrors = getErrors(errors)
    .map(error => new JkError(ErrorCode.ERR400, { message: Object.values(error.constraints || {}).join(',') }));
  if (jkErrors.length) {
    response.sendError(jkErrors[0], { notify: false, message: ERROR[ErrorCode.ERR400].message }, ...jkErrors.splice(1));
    throw new JkError(ErrorCode.ERR400);
  }
};

export const getValidPayload = async <T extends object>(req: JkRequest, res: JkResponse, cls: ClassConstructor<any>): Promise<T> => {
  const payload = plainToClass(cls, req.body, { excludeExtraneousValues: true, exposeUnsetFields: false });
  validPayloadErrors(await validate(payload), res);
  return classToPlain(payload) as T;
};

export const sortToSortResponse = (sort: SortType) => {
  const sortResponse: { [key: string]: 1 | -1 }[] = [];
  Object.entries(sort).forEach(([ key, value ]) => {
    sortResponse.push({ [key]: value });
  });
  return sortResponse;
};
