import { AWS_SQS_JUKI_CONNECTION_INTERNET_FIFO_URL } from 'config/settings';
import { sqsQueue } from 'services/aws/sqs/sqs';
import { InternetConnectionEventDTO } from 'types';

export const sqsFifoQueueInternetConnection = sqsQueue<InternetConnectionEventDTO>(AWS_SQS_JUKI_CONNECTION_INTERNET_FIFO_URL, true);
