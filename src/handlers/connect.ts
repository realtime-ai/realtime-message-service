import { Router, Request, Response } from 'express';
import { redis } from '../redis.js';

const router = Router();

interface ConnectRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  data?: {
    userId?: string;
    userName?: string;
  };
}

router.post('/connect', async (req: Request, res: Response) => {
  const body = req.body as ConnectRequest;
  const { client, data } = body;

  const userId = data?.userId;
  const userName = data?.userName || 'Anonymous';

  if (!userId) {
    console.warn('Connect rejected: missing userId');
    return res.json({
      error: { code: 4001, message: 'Unauthorized: userId required' },
    });
  }

  try {
    // 记录用户会话到 Redis
    await redis.hset(`sessions:${client}`, {
      userId,
      userName,
      connectedAt: Date.now().toString(),
    });

    // 设置会话过期时间 (24 小时)
    await redis.expire(`sessions:${client}`, 86400);

    console.info(`User connected: ${userId} (${userName}), client: ${client}`);

    res.json({
      result: {
        user: userId,
        info: { name: userName },
      },
    });
  } catch (error) {
    console.error('Connect error:', error);
    res.json({
      error: { code: 5000, message: 'Internal server error' },
    });
  }
});

export default router;
