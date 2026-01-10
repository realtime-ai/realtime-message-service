import { Hono } from 'hono';
import { ProcessMessage } from '../../core/use-cases/ProcessMessage';
import { ValidateSubscription } from '../../core/use-cases/ValidateSubscription';
import { IUserRepository } from '../../core/ports/IUserRepository';
import { ILogger } from '../../core/ports/ILogger';
import {
  CentrifugoConnectRequest,
  CentrifugoSubscribeRequest,
  CentrifugoPublishRequest,
} from '@centrifuge-realtime-message/shared';

export interface CentrifugoProxyControllerDeps {
  processMessage: ProcessMessage;
  validateSubscription: ValidateSubscription;
  userRepository: IUserRepository;
  logger: ILogger;
}

export function createCentrifugoProxyController(deps: CentrifugoProxyControllerDeps): Hono {
  const app = new Hono();
  const { processMessage, validateSubscription, userRepository, logger } = deps;

  /**
   * POST /centrifugo/connect
   * Called by Centrifugo when client connects
   */
  app.post('/connect', async (c) => {
    try {
      const body = await c.req.json<CentrifugoConnectRequest>();
      logger.debug('Centrifugo connect proxy', { client: body.client });

      // Extract user info from connection data
      const userData = body.data as { userId?: string; userName?: string } | undefined;

      if (!userData?.userId || !userData?.userName) {
        logger.warn('Connect rejected: missing user data');
        return c.json({
          error: {
            code: 4000,
            message: 'Missing user data',
          },
        });
      }

      // Check/create user
      let user = await userRepository.findById(userData.userId);
      if (!user) {
        const { User } = await import('@centrifuge-realtime-message/shared');
        user = new User(userData.userId, userData.userName);
        await userRepository.save(user);
      }

      logger.info('Client connected', { userId: user.id, client: body.client });

      return c.json({
        result: {
          user: user.id,
          info: { name: user.name },
        },
      });
    } catch (error) {
      logger.error('Connect proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return c.json({
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
  app.post('/subscribe', async (c) => {
    try {
      const body = await c.req.json<CentrifugoSubscribeRequest>();
      logger.debug('Centrifugo subscribe proxy', {
        user: body.user,
        channel: body.channel,
      });

      const result = await validateSubscription.execute({
        userId: body.user,
        channel: body.channel,
      });

      if (!result.allowed) {
        return c.json({
          error: {
            code: 4001,
            message: result.reason || 'Subscription not allowed',
          },
        });
      }

      return c.json({
        result: {
          info: body.data,
        },
      });
    } catch (error) {
      logger.error('Subscribe proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return c.json({
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
  app.post('/publish', async (c) => {
    try {
      const body = await c.req.json<CentrifugoPublishRequest>();
      logger.debug('Centrifugo publish proxy', {
        user: body.user,
        channel: body.channel,
      });

      // Get user info
      const user = await userRepository.findById(body.user);
      if (!user) {
        return c.json({
          error: {
            code: 4002,
            message: 'User not found',
          },
        });
      }

      const messageData = body.data as { text?: string } | undefined;
      if (!messageData?.text) {
        return c.json({
          error: {
            code: 4003,
            message: 'Message text required',
          },
        });
      }

      const result = processMessage.execute({
        userId: user.id,
        userName: user.name,
        channel: body.channel,
        data: { text: messageData.text },
      });

      return c.json({
        result: {
          data: result.publishData,
        },
      });
    } catch (error) {
      logger.error('Publish proxy error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message.includes('Message')) {
        return c.json({
          error: {
            code: 4004,
            message: error.message,
          },
        });
      }

      return c.json({
        error: {
          code: 5000,
          message: 'Internal error',
        },
      });
    }
  });

  return app;
}
