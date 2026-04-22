import { ContentsMetaType, JkError, Response } from './commons';

export type ResponseOptionsType = { message?: string, notify?: boolean, status?: number };

export type ResponseErrorType = (error: JkError, options?: ResponseOptionsType, ...restErrors: JkError[]) => void;
export type ResponseContentsType = <T, >(contents: T[], meta: ContentsMetaType, options?: ResponseOptionsType) => void;
export type ResponseContentType = <T, >(content: T, options?: ResponseOptionsType) => void;

export interface JkResponse extends Response {
  sendError: ResponseErrorType,
  sendContents: ResponseContentsType,
  sendContent: ResponseContentType,
}
