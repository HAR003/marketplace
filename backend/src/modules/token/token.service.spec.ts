import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenService, type JwtPayload } from './token.service.js';

const config = new ConfigService({
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  JWT_EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
});
const secret = (key: string) => config.getOrThrow<string>(key);

const jwtService = new JwtService();
const tokenService = new TokenService(jwtService, config);

type VerifiedPayload = JwtPayload & { iat: number; exp: number };

describe('TokenService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no database dependency: JwtService and ConfigService are all it needs', async () => {
    expect(TokenService.length).toBe(2);
    await expect(tokenService.issueAuthTokens(7)).resolves.toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('signs access and refresh tokens with their own secret, type and lifetime', async () => {
    const { accessToken, refreshToken, refreshExpires } =
      await tokenService.issueAuthTokens(7);

    const access = await jwtService.verifyAsync<VerifiedPayload>(accessToken, {
      secret: secret('JWT_ACCESS_SECRET'),
    });
    expect(access).toMatchObject({ sub: 7, type: 'access' });
    expect(access.exp - access.iat).toBe(15 * 60);

    const refresh = await jwtService.verifyAsync<VerifiedPayload>(
      refreshToken,
      { secret: secret('JWT_REFRESH_SECRET') },
    );
    expect(refresh).toMatchObject({ sub: 7, type: 'refresh' });
    expect(refresh.exp - refresh.iat).toBe(7 * 24 * 60 * 60);
    expect(refreshExpires.getTime()).toBe(refresh.exp * 1000);

    await expect(
      jwtService.verifyAsync(refreshToken, {
        secret: secret('JWT_ACCESS_SECRET'),
      }),
    ).rejects.toThrow();
  });

  describe('email verification tokens', () => {
    it('resolve to the user id', async () => {
      const token = await tokenService.signEmailVerificationToken(42);
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).resolves.toBe(42);
    });

    it('expire after 15 minutes', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
      const token = await tokenService.signEmailVerificationToken(42);

      vi.setSystemTime(new Date('2026-01-01T12:14:00Z'));
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).resolves.toBe(42);

      vi.setSystemTime(new Date('2026-01-01T12:16:00Z'));
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each([
      ['a missing token', undefined],
      ['an empty token', ''],
      ['a malformed token', 'not-a-jwt'],
    ])('reject %s', async (_label, token) => {
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reject a token with a tampered payload', async () => {
      const [header, , signature] = (
        await tokenService.signEmailVerificationToken(42)
      ).split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ sub: 1, type: 'email_verification' }),
      ).toString('base64url');

      await expect(
        tokenService.verifyEmailVerificationToken(
          `${header}.${forgedPayload}.${signature}`,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reject a token signed with another secret', async () => {
      const token = await jwtService.signAsync(
        { sub: 42, type: 'email_verification' },
        { secret: 'some-other-secret' },
      );
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reject another token type, even when signed with the verification secret', async () => {
      const token = await jwtService.signAsync(
        { sub: 42, type: 'access' },
        { secret: secret('JWT_EMAIL_VERIFICATION_SECRET') },
      );
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reject access and refresh tokens', async () => {
      const { accessToken, refreshToken } =
        await tokenService.issueAuthTokens(42);
      for (const token of [accessToken, refreshToken]) {
        await expect(
          tokenService.verifyEmailVerificationToken(token),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
    });
  });
});
