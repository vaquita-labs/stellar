import { Request } from 'lambda-api';

export interface JkRequest<T extends Request['params'] = {}, U extends Request['query'] = {}> extends Request {
  params: T,
  query: U,
  
  company: {
    id: string,
  },
}
