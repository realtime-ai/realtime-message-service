import { IUserRepository } from '../core/ports/IUserRepository.js';
import { ITokenService } from '../core/ports/ITokenService.js';
import { ILogger } from '../core/ports/ILogger.js';
import { InMemoryUserRepository } from '../adapters/repositories/InMemoryUserRepository.js';
import { NodeCryptoTokenService } from '../adapters/services/NodeCryptoTokenService.js';
import { ConsoleLogger } from '../adapters/services/ConsoleLogger.js';
import { AuthenticateUser } from '../core/use-cases/AuthenticateUser.js';
import { ProcessMessage } from '../core/use-cases/ProcessMessage.js';
import { ValidateSubscription } from '../core/use-cases/ValidateSubscription.js';
import { config } from './config.js';

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

/**
 * Singleton container instance
 */
class ContainerImpl implements Container {
  private static instance: ContainerImpl | null = null;

  // Ports
  readonly userRepository: InMemoryUserRepository;
  readonly tokenService: ITokenService;
  readonly logger: ILogger;

  // Use Cases
  readonly authenticateUser: AuthenticateUser;
  readonly processMessage: ProcessMessage;
  readonly validateSubscription: ValidateSubscription;

  private constructor() {
    // Initialize logger
    this.logger = new ConsoleLogger(config.logLevel);

    // Initialize repository (singleton to persist users)
    this.userRepository = new InMemoryUserRepository();

    // Initialize token service
    this.tokenService = new NodeCryptoTokenService(config.jwtSecret, config.centrifugoSecret);

    // Initialize use cases
    this.authenticateUser = new AuthenticateUser(
      this.userRepository,
      this.tokenService,
      this.logger
    );
    this.processMessage = new ProcessMessage(this.logger);
    this.validateSubscription = new ValidateSubscription(this.userRepository, this.logger);
  }

  static getInstance(): ContainerImpl {
    if (!ContainerImpl.instance) {
      ContainerImpl.instance = new ContainerImpl();
    }
    return ContainerImpl.instance;
  }

  /**
   * Reset container (useful for testing)
   */
  static reset(): void {
    if (ContainerImpl.instance) {
      ContainerImpl.instance.userRepository.clear();
    }
    ContainerImpl.instance = null;
  }
}

export const container = ContainerImpl.getInstance();

export function resetContainer(): void {
  ContainerImpl.reset();
}
