import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { redis } from '../redis';
import { getPartitionId, getStreamKeyForChannel } from '@centrifuge-realtime-message/shared/config';

const router = Router();

interface PublishRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data: {
    text?: string;
    [key: string]: unknown;
  };
  info?: {
    name?: string;
  };
}

router.post('/publish', async (req: Request, res: Response) => {
  const body = req.body as PublishRequest;
  const { client, user, channel, data, info } = body;

  const text = data?.text;

  // 基本验证
  if (!text || typeof text !== 'string') {
    return res.json({
      error: { code: 4003, message: 'Message text is required' },
    });
  }

  if (text.length > 5000) {
    return res.json({
      error: { code: 4003, message: 'Message text too long (max 5000 chars)' },
    });
  }

  const messageId = randomUUID();
  const timestamp = Date.now();
  const partitionId = getPartitionId(channel);

  // 构造消息载荷
  const message = {
    id: messageId,
    channel,
    partitionId,
    userId: user,
    userName: info?.name || 'Anonymous',
    text: text.trim(),
    timestamp: new Date(timestamp).toISOString(),
    raw: JSON.stringify(data),
    clientId: client,
  };

  try {
    // 写入对应分区的 Stream
    const streamKey = getStreamKeyForChannel(channel);

    await redis.xadd(streamKey, '*', 'payload', JSON.stringify(message));

    console.info(
      `Message ${messageId} written to ${streamKey} (partition: ${partitionId}, channel: ${channel})`
    );

    // 立即返回成功，Centrifugo 广播消息
    res.json({
      result: {
        data: {
          id: messageId,
          text: message.text,
          user: { id: user, name: message.userName },
          timestamp: message.timestamp,
        },
      },
    });
  } catch (error) {
    console.error('Publish error:', error);
    res.json({
      error: { code: 5000, message: 'Failed to process message' },
    });
  }
});

export default router;
