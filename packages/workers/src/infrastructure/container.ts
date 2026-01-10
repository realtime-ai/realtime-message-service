import { IUserRepository } from '../core/ports/IUserRepository';
import { ITokenService } from '../core/ports/ITokenService';
import { ILogger, LogLevel } from '../core/ports/ILogger';
import { InMemoryUserRepository } from '../adapters/repositories/InMemoryUserRepository';
import { WebCryptoTokenService } from '../adapters/services/WebCryptoTokenService';
import { WorkersLogger } from '../adapters/services/WorkersLogger';
import { AuthenticateUser } from '../core/use-cases/AuthenticateUser';
import { ProcessMessage } from '../core/use-cases/ProcessMessage';
import { ValidateSubscription } from '../core/use-cases/ValidateSubscription';

export interface Env {
  JWT_SECRET: string;
  CENTRIFUGO_SECRET: string;
  FRONTEND_URL: string;
  LOG_LEVEL?: string;
}

export interface Container {
  // Ports
  userRepository: IUserRepository;
  tokenService: ITokenService;
  logger: ILogger;

  // Use Cases
  authenticateUser: AuthenticateUser;
  processMessage: ProcessMessage;
  validateSubscription: ValidateSubscription;
}

// Singleton instances (persist across requests within same worker instance)
let userRepository: InMemoryUserRepository | null = null;

export function createContainer(env: Env): Container {
  // Logger (create new for each request for potential request-scoped context)
  const logLevel = (env.LOG_LEVEL || 'info') as LogLevel;
  const logger = new WorkersLogger(logLevel);

  // User repository (singleton to persist users across requests)
  if (!userRepository) {
    userRepository = new InMemoryUserRepository();
  }

  // Token service
  const tokenService = new WebCryptoTokenService(env.JWT_SECRET, env.CENTRIFUGO_SECRET);

  // Use cases
  const authenticateUser = new AuthenticateUser(userRepository, tokenService, logger);

  const processMessage = new ProcessMessage(logger);

  const validateSubscription = new ValidateSubscription(userRepository, logger);

  return {
    userRepository,
    tokenService,
    logger,
    authenticateUser,
    processMessage,
    validateSubscription,
  };
}
