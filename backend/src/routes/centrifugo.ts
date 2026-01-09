import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  CentrifugoConnectRequest,
  CentrifugoSubscribeRequest,
  CentrifugoPublishRequest,
  CentrifugoConnectResponse,
  CentrifugoSubscribeResponse,
  CentrifugoPublishResponse,
  ChatMessage,
} from '../types';

const router = Router();

// Connect proxy - called when client connects to Centrifugo
router.post('/connect', (req: Request, res: Response) => {
  const request = req.body as CentrifugoConnectRequest;

  console.log('[Centrifugo Connect]', {
    client: request.client,
    transport: request.transport,
  });

  // The user info comes from the JWT token that Centrifugo validates
  // We just acknowledge the connection here
  const response: CentrifugoConnectResponse = {
    result: {
      user: '', // Will be set by Centrifugo from JWT
    },
  };

  res.json(response);
});

// Subscribe proxy - called when client subscribes to a channel
router.post('/subscribe', (req: Request, res: Response) => {
  const request = req.body as CentrifugoSubscribeRequest;

  console.log('[Centrifugo Subscribe]', {
    client: request.client,
    user: request.user,
    channel: request.channel,
  });

  // Validate channel name (must start with "chat:")
  if (!request.channel.startsWith('chat:')) {
    const response: CentrifugoSubscribeResponse = {
      error: {
        code: 403,
        message: 'Invalid channel namespace. Use chat:channelname format.',
      },
    };
    res.json(response);
    return;
  }

  // Allow subscription
  const response: CentrifugoSubscribeResponse = {
    result: {
      info: {
        user: request.user,
      },
      data: {
        message: `Welcome to ${request.channel}!`,
      },
    },
  };

  res.json(response);
});

// Publish proxy - called when client publishes to a channel
router.post('/publish', (req: Request, res: Response) => {
  const request = req.body as CentrifugoPublishRequest;

  console.log('[Centrifugo Publish]', {
    client: request.client,
    user: request.user,
    channel: request.channel,
    data: request.data,
  });

  // Validate message
  if (!request.data?.text || typeof request.data.text !== 'string') {
    const response: CentrifugoPublishResponse = {
      error: {
        code: 400,
        message: 'Message text is required',
      },
    };
    res.json(response);
    return;
  }

  // Enrich the message with metadata
  const enrichedMessage: ChatMessage = {
    id: uuidv4(),
    text: request.data.text.trim(),
    user: {
      id: request.user,
      name: (req.body.info?.name as string) || request.user,
    },
    timestamp: new Date().toISOString(),
  };

  const response: CentrifugoPublishResponse = {
    result: {
      data: enrichedMessage,
    },
  };

  res.json(response);
});

export default router;
