import { User } from '@centrifuge-realtime-message/shared';
import { v4 as uuidv4 } from 'uuid';
import { IUserRepository } from '../ports/IUserRepository.js';
import { ITokenService } from '../ports/ITokenService.js';
import { ILogger } from '../ports/ILogger.js';

/**
 * Authenticate User Use Case
 * Handles user login/registration and token generation
 */
export interface AuthenticateUserInput {
  name: string;
}

export interface AuthenticateUserOutput {
  user: User;
  token: string;
  centrifugoToken: string;
}

export class AuthenticateUser {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly logger: ILogger
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const { name } = input;

    this.logger.debug('Authenticating user', { name });

    // Check if user already exists
    let user = await this.userRepository.findByName(name);

    if (!user) {
      // Create new user
      user = new User(uuidv4(), name);
      await this.userRepository.save(user);
      this.logger.info('New user created', { userId: user.id, name: user.name });
    } else {
      this.logger.debug('Existing user found', { userId: user.id });
    }

    // Generate tokens
    const tokenPayload = {
      sub: user.id,
      name: user.name,
      info: { name: user.name },
    };

    const [token, centrifugoToken] = await Promise.all([
      this.tokenService.generateToken(tokenPayload),
      this.tokenService.generateCentrifugoToken(tokenPayload),
    ]);

    this.logger.debug('Tokens generated for user', { userId: user.id });

    return {
      user,
      token,
      centrifugoToken,
    };
  }
}
