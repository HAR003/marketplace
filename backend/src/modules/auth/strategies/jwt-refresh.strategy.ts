import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { JwtPayload } from '../../token/token.service.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { REFRESH_COOKIE_NAME } from '../refresh-cookie.js';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: (req: Request): string | null =>
        req.cookies?.[REFRESH_COOKIE_NAME] ?? null,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub };
  }
}
