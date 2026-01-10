import { User } from '@centrifuge-realtime-message/shared';
import { IUserRepository } from '../ports/IUserRepository';
import { ITokenService } from '../ports/ITokenService';
import { ILogger } from '../ports/ILogger';

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
      user = new User(crypto.randomUUID(), name);
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
