import { ObjectId } from 'mongodb';

export const objectIdIsValid = ObjectId.isValid;

export const newObjectId = () => new ObjectId();
