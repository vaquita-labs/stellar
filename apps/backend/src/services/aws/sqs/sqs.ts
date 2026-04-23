import {
  ChangeMessageVisibilityCommand,
  ChangeMessageVisibilityCommandOutput,
  DeleteMessageCommand,
  DeleteMessageCommandOutput,
  GetQueueAttributesCommand,
  GetQueueAttributesCommandOutput,
  PurgeQueueCommand,
  PurgeQueueCommandOutput,
  ReceiveMessageCommand,
  ReceiveMessageCommandOutput,
  ReceiveMessageRequest,
  ReceiveMessageResult,
  SendMessageCommand,
  SendMessageCommandOutput,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { ContentResponseType } from '@juki-team/commons/dist/types/types';
import { AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SECRET_ACCESS_KEY, WITHOUT_AWS_KEYS } from 'config/settings';

import { log } from 'services/log';
import { LogLevel } from 'types';

export const awsSqs = new SQSClient({
  region: AWS_REGION,
  apiVersion: '2012-11-05',
  credentials: WITHOUT_AWS_KEYS
    ? undefined
    : { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
});

export function sqsQueue<T>(queueUrl: string, isFifo: boolean) {
  return {
    deleteMessage: async ({ receiveMessageResult }: {
      receiveMessageResult: ReceiveMessageResult
    }): Promise<DeleteMessageCommandOutput> => {
      const receiptHandle = receiveMessageResult?.Messages?.[0].ReceiptHandle || '';
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });
      const result = await awsSqs.send(command);
      log(LogLevel.DEBUG)(`message deleted of ${queueUrl}, receiptHandle: "${receiptHandle}"`);
      log(LogLevel.TRACE)(`message deleted of ${queueUrl}, receiptHandle: "${receiptHandle}", result: "${JSON.stringify(result)}"`);
      return result;
    },
    deleteMessageByReceiptHandle: async (receiptHandle: string): Promise<DeleteMessageCommandOutput> => {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });
      const result = await awsSqs.send(command);
      log(LogLevel.DEBUG)(`message deleted of ${queueUrl}, receiptHandle: "${receiptHandle}"`);
      log(LogLevel.TRACE)(`message deleted of ${queueUrl}, receiptHandle: "${receiptHandle}", result: "${JSON.stringify(result)}"`);
      return result;
    },
    receiveMessage: async (props?: {
      visibilityTimeout: number,
      waitTimeSeconds: number
    }): Promise<ReceiveMessageCommandOutput> => {
      const { visibilityTimeout = 900, waitTimeSeconds = 20 } = props || {};
      const params: ReceiveMessageRequest = {
        QueueUrl: queueUrl,
        AttributeNames: [
          // 'SentTimestamp', // ERROR  Type '"SentTimestamp"' is not assignable to type 'QueueAttributeName'. // QueueAttributeName..
        ],
        MaxNumberOfMessages: 1,
        MessageAttributeNames: [
          'All',
        ],
        VisibilityTimeout: visibilityTimeout, // Should be between 0 seconds and 12 hours.
        WaitTimeSeconds: waitTimeSeconds, // Should be between 0 and 20 seconds.
      };
      const command = new ReceiveMessageCommand(params);
      return await awsSqs.send(command);
    },
    sendMessage: async ({
                          messageBody: _messageBody,
                          content,
                          messageDeduplicationId,
                          messageGroupId,
                        }: {
      content: ContentResponseType<T>,
      messageBody?: void,
      messageDeduplicationId: string,
      messageGroupId: string,
    } | {
      content?: void,
      messageBody: string,
      messageDeduplicationId: string,
      messageGroupId: string,
    }): Promise<SendMessageCommandOutput> => {
      const messageBody = content ? JSON.stringify(content) : (_messageBody ?? '');
      const command = new SendMessageCommand({
        // Remove DelaySeconds parameter and value for FIFO queues
        // DelaySeconds: 10,
        MessageAttributes: {
          'Type': {
            DataType: 'String',
            StringValue: 'Exec command',
          },
        },
        QueueUrl: queueUrl,
        MessageBody: messageBody,
        ...(isFifo
          ? { MessageDeduplicationId: messageDeduplicationId, MessageGroupId: messageGroupId }
          : {}),
        // DelaySeconds: delaySeconds,
      });
      const result = await awsSqs.send(command);
      log(LogLevel.DEBUG)(`message sent to ${queueUrl}, messageDeduplicationId: "${messageDeduplicationId}", messageGroupId: "${messageGroupId}"`);
      log(LogLevel.TRACE)(`message sent to ${queueUrl}, messageDeduplicationId: "${messageDeduplicationId}", messageGroupId: "${messageGroupId}", body: "${messageBody}"`);
      return result;
    },
    changeMessageVisibility: async ({
                                      receiveMessageResult,
                                      visibilityTimeout,
                                    }: {
      receiveMessageResult: ReceiveMessageResult,
      visibilityTimeout: number
    }): Promise<ChangeMessageVisibilityCommandOutput> => {
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiveMessageResult?.Messages?.[0].ReceiptHandle || '',
        VisibilityTimeout: visibilityTimeout,
      });
      return await awsSqs.send(command);
    },
    getQueueAttributes: async (): Promise<GetQueueAttributesCommandOutput> => {
      const command = new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: [ 'All' ] });
      return await awsSqs.send(command);
    },
    purgeQueue: async (): Promise<PurgeQueueCommandOutput> => {
      const command = new PurgeQueueCommand({ QueueUrl: queueUrl });
      return await awsSqs.send(command);
    },
  };
}
