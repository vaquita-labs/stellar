import { WithId } from 'mongodb';
import { NewEntityDocument } from 'types';

export type EntityDocument<T> = WithId<NewEntityDocument<T>>;
