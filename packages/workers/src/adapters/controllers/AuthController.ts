import { Hono } from 'hono';
import { AuthenticateUser } from '../../core/use-cases/AuthenticateUser';
import { ILogger } from '../../core/ports/ILogger';
import { loginRequestSchema, validateRequest } from '../../infrastructure/validation/schemas';

export interface AuthControllerDeps {
  authenticateUser: AuthenticateUser;
  logger: ILogger;
}

export function createAuthController(deps: AuthControllerDeps): Hono {
  const app = new Hono();
  const { authenticateUser, logger } = deps;

  /**
   * POST /auth/login
   * Authenticate user and return tokens
   */
  app.post('/login', async (c) => {
    try {
      const body = await c.req.json();

      // Validate input
      const validation = validateRequest(loginRequestSchema, body);
      if (!validation.success) {
        logger.warn('Login validation failed', { error: validation.error });
        return c.json({ error: validation.error }, 400);
      }

      const result = await authenticateUser.execute({ name: validation.data.name });

      logger.info('User logged in', { userId: result.user.id });

      return c.json({
        user: result.user.toJSON(),
        token: result.token,
        centrifugoToken: result.centrifugoToken,
      });
    } catch (error) {
      logger.error('Login failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message.includes('User')) {
        return c.json({ error: error.message }, 400);
      }

      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
