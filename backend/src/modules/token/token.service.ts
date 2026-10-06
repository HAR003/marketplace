import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

export type TokenType = 'access' | 'refresh' | 'email_verification';

export interface JwtPayload {
  sub: number;
  type: TokenType;
}

// Fixed rather than configurable, because the verification email promises this lifetime
export const EMAIL_VERIFICATION_TTL_MINUTES = 15;

const INVALID_VERIFICATION_TOKEN = 'Invalid or expired verification token';

interface TokenSettings {
  secret: string;
  expiresIn: JwtSignOptions['expiresIn'];
}

// All tokens are stateless JWTs: nothing here is ever written to the database.
// Each type has its own secret and a `type` claim, so one can't stand in for another.
@Injectable()
export class TokenService {
  private readonly settings: Record<TokenType, TokenSettings>;

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.settings = {
      access: {
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: config.getOrThrow<JwtSignOptions['expiresIn']>(
          'JWT_ACCESS_EXPIRES_IN',
        ),
      },
      refresh: {
        secret: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: config.getOrThrow<JwtSignOptions['expiresIn']>(
          'JWT_REFRESH_EXPIRES_IN',
        ),
      },
      email_verification: {
        secret: config.getOrThrow<string>('JWT_EMAIL_VERIFICATION_SECRET'),
        expiresIn: EMAIL_VERIFICATION_TTL_MINUTES * 60, // seconds
      },
    };
  }

  async issueAuthTokens(userId: number) {
    const accessToken = await this.sign('access', userId);
    const refreshToken = await this.sign('refresh', userId);
    const { exp } = this.jwtService.decode<{ exp: number }>(refreshToken);
    return { accessToken, refreshToken, refreshExpires: new Date(exp * 1000) };
  }

  signAccessToken(userId: number) {
    return this.sign('access', userId);
  }

  signEmailVerificationToken(userId: number) {
    return this.sign('email_verification', userId);
  }

  // Returns the user id. A missing, malformed, tampered, expired or wrong-type token is a 401.
  async verifyEmailVerificationToken(
    token: string | undefined,
  ): Promise<number> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token ?? '', {
        secret: this.settings.email_verification.secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException(INVALID_VERIFICATION_TOKEN);
    }
    if (payload.type !== 'email_verification') {
      throw new UnauthorizedException(INVALID_VERIFICATION_TOKEN);
    }
    return payload.sub;
  }

  private sign(type: TokenType, userId: number) {
    const { secret, expiresIn } = this.settings[type];
    const payload: JwtPayload = { sub: userId, type };
    return this.jwtService.signAsync(payload, { secret, expiresIn });
  }
}
