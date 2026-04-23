import { MONGO_DATABASE_NAME, MONGO_DATABASE_URI } from 'config/settings';
import { isObjectJson } from 'helpers/commons';
import { atomizeChangeset, diff } from 'json-diff-ts';
import {
  Db,
  Document,
  MatchKeysAndValues,
  MongoClient,
  ObjectId,
  OnlyFieldsOfType,
  OptionalUnlessRequiredId,
  Sort,
} from 'mongodb';
import objectSizeOf from 'object-sizeof';
import { log } from 'services/log';
import type {
  CreateEntityDocument,
  EntityDocument,
  EntityLog,
  EntityLogChanges,
  Filter,
  InsertOneResult,
  PaginatedDocuments,
  SortType,
  UpdateEntityDocument,
} from 'types';
import { EntityState, ErrorCode, JkError, LogLevel } from 'types';

const myObjectSizeOf = (obj: any) => {
  if (isObjectJson(obj)) {
    return JSON.stringify(obj).length * 2;
  }
  return objectSizeOf(obj);
};

let dbClientConnectedRef: { current: Db, connected: boolean } | null = null;

export function dbClientConnect() {
  return new Promise(async (resolve, reject) => {
    if (!dbClientConnectedRef?.connected) {
      log(LogLevel.INFO)(`mongo client connecting,  MONGO_DATABASE_NAME: "${MONGO_DATABASE_NAME}", MONGO_DATABASE_URI: "${MONGO_DATABASE_URI}"`);
      const mongoClient = await MongoClient.connect(MONGO_DATABASE_URI);
      await mongoClient.connect();
      dbClientConnectedRef = {
        current: mongoClient.db(MONGO_DATABASE_NAME),
        connected: true,
      };
      log(LogLevel.INFO)(`mongo client connected`);
      resolve(true);
    } else {
      log(LogLevel.TRACE)(`redis client already connected`);
      resolve(true);
    }
  });
}

export function dbCrud<T>(collection: string) {
  type EntityDoc = EntityDocument<T>;
  
  let mongoCollection = dbClientConnectedRef?.current?.collection<EntityDoc>(collection)!;
  
  const connect = async () => {
    if (mongoCollection) {
      return mongoCollection;
    } else {
      await dbClientConnect();
      mongoCollection = dbClientConnectedRef?.current.collection<EntityDoc>(collection)!;
      log(LogLevel.INFO)(`collection "${collection}"connected`);
    }
  };
  
  const updateOne = async (documentId: string, document: UpdateEntityDocument<T>, customer: null, withoutLog?: boolean) => {
    const now = new Date();
    let documentToUpdate = { ...document } as MatchKeysAndValues<EntityDoc>;
    const unset: { [key: string]: '' | true | 1 } = {};
    Object.keys(documentToUpdate).forEach(key => {
      if (documentToUpdate[key] === undefined || JSON.stringify(documentToUpdate[key]) === '{}') {
        unset[key] = 1;
      }
      // documentToUpdate[key] === undefined && delete documentToUpdate[key]
    });
    if (Object.keys(documentToUpdate).length === 0) {
      return;
    }
    await connect();
    if (Object.keys(unset).length) {
      log(LogLevel.INFO)(`update unset: "${JSON.stringify(unset)}",  collection: "${collection}", id: "${documentId}`);
      await mongoCollection
        .updateOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>, {
          $unset: unset as OnlyFieldsOfType<EntityDoc, any, '' | true | 1>,
        });
    }
    let updatedDocument;
    if (withoutLog) {
      updatedDocument = await mongoCollection
        .updateOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>, { $set: documentToUpdate });
    } else {
      const oldDocument = await mongoCollection.findOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>);
      documentToUpdate = { ...documentToUpdate, updatedAt: now };
      updatedDocument = await mongoCollection
        .updateOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>, { $set: documentToUpdate });
      const newDocument = await mongoCollection.findOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>);
      const atomicChanges = atomizeChangeset(diff(oldDocument, newDocument)).filter(({ path }) => path !== '$._id.buffer');
      const documentWithoutLogs = { ...newDocument, logs: [] };
      const bytes = myObjectSizeOf(documentWithoutLogs);
      const maxBytes = 1024 * 50; // 50 KB
      const newLog: EntityLog = {
        changes: atomicChanges as unknown as EntityLogChanges[],
        timestamp: now.getTime(),
        customerUserId: '', // customer._id.toString(),
      };
      let logs: EntityLog[] = [];
      if (bytes < maxBytes) {
        logs = [
          newLog,
          ...(newDocument?.logs ?? []),
        ];
        while (bytes + myObjectSizeOf(logs) > maxBytes && !!logs.length) {
          logs.pop();
        }
      }
      if (!logs.length) {
        logs = [ newLog ];
      }
      const documentToUpdateWithLogs = {
        updatedAt: now,
        logs,
      } as MatchKeysAndValues<EntityDoc>;
      await mongoCollection.updateOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>, { $set: documentToUpdateWithLogs });
    }
    if (!updatedDocument) {
      throw new JkError(ErrorCode.ERR0303);
    }
    return updatedDocument;
  };
  
  return {
    insertOne: async (company: null, customer: null, document: CreateEntityDocument<T>): Promise<InsertOneResult> => {
      const now = new Date();
      const documentToInsert = {
        ...document,
        createdAt: now,
        updatedAt: now,
        // companyId: '', // company._id.toString(),
        ownerUserId: '', // !!(customer?._id?.toString?.()) ? customer._id.toString() : company.systemAdminUserId,
        state: EntityState.RELEASED,
        logs: [],
      } as OptionalUnlessRequiredId<EntityDoc>;
      await connect();
      const newDocument = await mongoCollection.insertOne(documentToInsert);
      if (!newDocument) {
        log(LogLevel.WARN)('error on insertOne', { collection, company, customer, document });
        throw new JkError(ErrorCode.ERR0810, { message: 'not created' });
      }
      return newDocument;
    },
    findOne: async (documentId: string, options?: {
      projection?: { [key: string]: 1 }
    } | void): Promise<EntityDoc> => {
      const { projection } = options || {};
      await connect();
      const document = await mongoCollection.findOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>, { projection });
      if (!document) {
        log(LogLevel.WARN)('error on findOne', { collection, documentId });
        throw new JkError(ErrorCode.ERR0211, { message: 'not found' });
      }
      return document as EntityDoc;
    },
    findOneByFilter: async (filter: Filter<EntityDoc>, options?: {
      sort?: Sort,
      projection?: { [key: string]: 1 }
    } | void): Promise<EntityDoc> => {
      const { projection, sort } = options || {};
      await connect();
      const document = await mongoCollection.findOne(filter, { projection, sort });
      if (!document) {
        log(LogLevel.WARN)('error on findOneByFilter', { collection, filter });
        throw new JkError(ErrorCode.ERR0211, { message: 'not found' });
      }
      return document as EntityDoc;
    },
    findByFilter: async (filter: Filter<EntityDoc>, options?: {
      sort?: Sort,
      projection?: { [key: string]: 1 }
    } | void): Promise<EntityDoc[]> => {
      const { projection, sort } = options || {};
      await connect();
      const document = await mongoCollection.find(filter, { projection, sort }).toArray();
      if (!document) {
        log(LogLevel.WARN)('error on findByFilter', { collection, filter, options });
        throw new JkError(ErrorCode.ERR0211, { message: 'not found' });
      }
      return document as EntityDoc[];
    },
    findPaginated: async (page: number, size: number, sort: SortType | undefined = {}, filter: Filter<EntityDoc> | undefined, projection: {} | undefined): Promise<PaginatedDocuments<EntityDoc>> => {
      await connect();
      const totalElements = await mongoCollection.countDocuments(filter as Filter<Document>);
      const pages = Math.ceil(totalElements / size);
      const startFrom = (page - 1) * size;
      
      const result = await mongoCollection
        .find(filter as Filter<EntityDoc>, { projection })
        .sort(sort)
        .skip(startFrom)
        .limit(size)
        .toArray() as EntityDoc[];
      
      return { result, totalElements, page, size, sort, pages };
    },
    updateOne,
    countDocuments: async (filter: Filter<EntityDoc>) => {
      await connect();
      return await mongoCollection.countDocuments(filter);
    },
    deleteOne: (documentId: string, customer: null) => (
      updateOne(documentId, { state: EntityState.ARCHIVED } as unknown as UpdateEntityDocument<T>, customer)
    ),
    __UNSAFE__mongoCollection: () => mongoCollection,
    __UNSAFE__deleteOne: async (documentId: string) => {
      await connect();
      return await mongoCollection.deleteOne({ _id: new ObjectId(documentId) } as Filter<EntityDoc>);
    },
  };
}
