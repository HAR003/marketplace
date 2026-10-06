import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { JwtRefreshStrategy } from './jwt-refresh.strategy.js';
import { JwtStrategy } from './jwt.strategy.js';

const config = new ConfigService({
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
});

describe('JWT strategies', () => {
  it('the access strategy accepts only access tokens', () => {
    const strategy = new JwtStrategy(config);

    expect(strategy.validate({ sub: 1, type: 'access' })).toEqual({
      userId: 1,
    });
    expect(() => strategy.validate({ sub: 1, type: 'refresh' })).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      strategy.validate({ sub: 1, type: 'email_verification' }),
    ).toThrow(UnauthorizedException);
  });

  it('the refresh strategy accepts only refresh tokens', () => {
    const strategy = new JwtRefreshStrategy(config);

    expect(strategy.validate({ sub: 1, type: 'refresh' })).toEqual({
      userId: 1,
    });
    expect(() => strategy.validate({ sub: 1, type: 'access' })).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      strategy.validate({ sub: 1, type: 'email_verification' }),
    ).toThrow(UnauthorizedException);
  });
});
