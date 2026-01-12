import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticateUser } from '../../core/use-cases/AuthenticateUser.js';
import { ILogger } from '../../core/ports/ILogger.js';
import { loginRequestSchema, validateRequest } from '../../infrastructure/validation/schemas.js';

export interface AuthControllerDeps {
  authenticateUser: AuthenticateUser;
  logger: ILogger;
}

export function createAuthRouter(deps: AuthControllerDeps): Router {
  const router = Router();
  const { authenticateUser, logger } = deps;

  /**
   * POST /auth/login
   * Authenticate user and return tokens
   */
  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;

      // Validate input
      const validation = validateRequest(loginRequestSchema, body);
      if (!validation.success) {
        logger.warn('Login validation failed', { error: validation.error });
        res.status(400).json({ error: validation.error });
        return;
      }

      const result = await authenticateUser.execute({ name: validation.data.name });

      logger.info('User logged in', { userId: result.user.id });

      res.json({
        user: result.user.toJSON(),
        token: result.token,
        centrifugoToken: result.centrifugoToken,
      });
    } catch (error) {
      logger.error('Login failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message.includes('User')) {
        res.status(400).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  return router;
}
