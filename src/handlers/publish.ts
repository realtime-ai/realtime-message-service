import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { redis } from '../redis.js';
import { getWorkerForChannel, getWorkerStreamKey } from '../config/index.js';

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

  // Basic validation
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

  try {
    // Get worker for this channel (sticky routing with local cache)
    const workerId = await getWorkerForChannel(redis, channel);
    const streamKey = getWorkerStreamKey(workerId);

    // Construct message payload
    const message = {
      id: messageId,
      channel,
      workerId,
      userId: user,
      userName: info?.name || 'Anonymous',
      text: text.trim(),
      timestamp: new Date(timestamp).toISOString(),
      raw: JSON.stringify(data),
      clientId: client,
    };

    // Write to worker's stream
    await redis.xadd(streamKey, '*', 'payload', JSON.stringify(message));

    console.info(
      `Message ${messageId} written to ${streamKey} (worker: ${workerId}, channel: ${channel})`
    );

    // Return success immediately, Centrifugo broadcasts the message
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
