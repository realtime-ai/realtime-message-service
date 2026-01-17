import { Router, Request, Response } from 'express';

const router = Router();

interface SubscribeRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  user: string;
  channel: string;
  data?: Record<string, unknown>;
}

// 允许的频道模式
const ALLOWED_CHANNEL_PATTERNS = [
  /^chat$/, // 主聊天频道
  /^chat:[\w-]+$/, // 房间特定频道 (chat:room-123)
  /^user:[\w-]+$/, // 用户特定频道 (user:user-123)
];

router.post('/subscribe', async (req: Request, res: Response) => {
  const body = req.body as SubscribeRequest;
  const { user, channel } = body;

  // 验证频道格式
  const isValidChannel = ALLOWED_CHANNEL_PATTERNS.some((pattern) => pattern.test(channel));

  if (!isValidChannel) {
    console.warn(`Subscribe rejected: invalid channel "${channel}"`);
    return res.json({
      error: { code: 4003, message: `Invalid channel: ${channel}` },
    });
  }

  // user: 开头的频道只能订阅自己的
  if (channel.startsWith('user:')) {
    const channelUserId = channel.split(':')[1];
    if (channelUserId !== user) {
      console.warn(`Subscribe rejected: user ${user} cannot subscribe to ${channel}`);
      return res.json({
        error: { code: 4003, message: 'Cannot subscribe to other user channels' },
      });
    }
  }

  console.info(`User ${user} subscribed to channel: ${channel}`);

  res.json({
    result: {},
  });
});

export default router;
