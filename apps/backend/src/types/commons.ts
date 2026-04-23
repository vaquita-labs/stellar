export { Document } from 'mongodb';
export { Filter, InsertOneResult, ObjectId, UpdateFilter, WithId } from 'mongodb';
export type { NextFunction, Request, Response, API, HandlerFunction, Middleware } from 'lambda-api';
export {
  NewEntityDocument, EntityState, ErrorCode, JkError, LogLevel, CreateEntityDocument,
  ContentsMetaType,
  EntityLog,
  EntityLogChanges,
  UpdateEntityDocument,
} from '@juki-team/commons';
export type { _Object as S3Object } from '@aws-sdk/client-s3';

export type SortType = { [key: string]: -1 | 1 };

export type PaginatedDocuments<T> = {
  result: T[],
  totalElements: number,
  page: number,
  size: number,
  pages: number,
  sort: SortType,
};
