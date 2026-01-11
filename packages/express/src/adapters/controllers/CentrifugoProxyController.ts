import { Router, Request, Response, NextFunction } from 'express';
import { User } from '@centrifuge-realtime-message/shared';
import { ProcessMessage } from '../../core/use-cases/ProcessMessage.js';
import { ValidateSubscription } from '../../core/use-cases/ValidateSubscription.js';
import { IUserRepository } from '../../core/ports/IUserRepository.js';
import { ILogger } from '../../core/ports/ILogger.js';

export interface CentrifugoProxyControllerDeps {
  processMessage: ProcessMessage;
  validateSubscription: ValidateSubscription;
  userRepository: IUserRepository;
  logger: ILogger;
}

interface CentrifugoConnectRequest {
  client: string;
  transport: string;
  protocol: string;
  encoding: string;
  data?: {
    userId?: string;
    userName?: string;
  };
}

interface CentrifugoSubscribeRequest {
  client: string;
  user: string;
  channel: string;
  data?: unknown;
}

interface CentrifugoPublishRequest {
  client: string;
  user: string;
  channel: string;
  data?: {
    text?: string;
  };
}

export function createCentrifugoProxyRouter(deps: CentrifugoProxyControllerDeps): Router {
  const router = Router();
  const { processMessage, validateSubscription, userRepository, logger } = deps;

  /**
   * POST /centrifugo/connect
   * Called by Centrifugo when client connects
   */
  router.post('/connect', async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const body = req.body as CentrifugoConnectRequest;
      logger.debug('Centrifugo connect proxy', { client: body.client });

      // Extract user info from connection data
      const userData = body.data;

      if (!userData?.userId || !userData?.userName) {
        logger.warn('Connect rejected: missing user data');
        res.json({
          error: {
            code: 4000,
            message: 'Missing user data',
          },
        });
        return;
      }

      // Check/create user
      let user = await userRepository.findById(userData.userId);
      if (!user) {
        user = new User(userData.userId, userData.userName);
        await userRepository.save(user);
      }

      logger.info('Client connected', { userId: user.id, client: body.client });

      res.json({
        result: {
          user: user.id,
          info: { name: user.name },
        },
      });
    } catch (error) {
      logger.error('Connect proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.json({
        error: {
          code: 5000,
          message: 'Internal error',
        },
      });
    }
  });

  /**
   * POST /centrifugo/subscribe
   * Called by Centrifugo when client subscribes to channel
   */
  router.post('/subscribe', async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const body = req.body as CentrifugoSubscribeRequest;
      logger.debug('Centrifugo subscribe proxy', {
        user: body.user,
        channel: body.channel,
      });

      const result = await validateSubscription.execute({
        userId: body.user,
        channel: body.channel,
      });

      if (!result.allowed) {
        res.json({
          error: {
            code: 4001,
            message: result.reason || 'Subscription not allowed',
          },
        });
        return;
      }

      res.json({
        result: {
          info: body.data,
        },
      });
    } catch (error) {
      logger.error('Subscribe proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.json({
        error: {
          code: 5000,
          message: 'Internal error',
        },
      });
    }
  });

  /**
   * POST /centrifugo/publish
   * Called by Centrifugo when client publishes message
   */
  router.post('/publish', async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const body = req.body as CentrifugoPublishRequest;
      logger.debug('Centrifugo publish proxy', {
        user: body.user,
        channel: body.channel,
      });

      // Get user info
      const user = await userRepository.findById(body.user);
      if (!user) {
        res.json({
          error: {
            code: 4002,
            message: 'User not found',
          },
        });
        return;
      }

      const messageData = body.data;
      if (!messageData?.text) {
        res.json({
          error: {
            code: 4003,
            message: 'Message text required',
          },
        });
        return;
      }

      const result = processMessage.execute({
        userId: user.id,
        userName: user.name,
        channel: body.channel,
        data: { text: messageData.text },
      });

      res.json({
        result: {
          data: result.publishData,
        },
      });
    } catch (error) {
      logger.error('Publish proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message.includes('Message')) {
        res.json({
          error: {
            code: 4004,
            message: error.message,
          },
        });
        return;
      }

      res.json({
        error: {
          code: 5000,
          message: 'Internal error',
        },
      });
    }
  });

  return router;
}
