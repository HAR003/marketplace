import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UniqueConstraintError } from 'sequelize';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { MailService } from '../mail/mail.service.js';
import { TokenService } from '../token/token.service.js';
import type User from '../user/Models/userModel.js';
import type { UserService } from '../user/user.service.js';
import { AuthService, RESEND_VERIFICATION_MESSAGE } from './auth.service.js';

const PASSWORD = 'correct horse battery';
const registration = {
  username: 'alice',
  email: 'alice@example.com',
  password: PASSWORD,
};

const tokenService = new TokenService(
  new JwtService(),
  new ConfigService({
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    JWT_EMAIL_VERIFICATION_SECRET: 'test-email-verification-secret',
  }),
);

type UserFields = Pick<
  User,
  'id' | 'username' | 'email' | 'password' | 'emailVerified'
>;

function makeUser(overrides: Partial<UserFields> = {}): User {
  const fields: UserFields = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    password: '',
    emailVerified: false,
    ...overrides,
  };
  return fields as unknown as User;
}

// Resolves to the error a promise rejects with
const rejectionOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('Expected the promise to reject');
    },
    (error: unknown) => error,
  );

describe('AuthService', () => {
  let passwordHash: string;
  let userService: Record<
    'create' | 'findByUsername' | 'findById' | 'markEmailVerified',
    Mock
  >;
  let mailService: { sendVerificationEmail: Mock };
  let authService: AuthService;

  beforeAll(async () => {
    // A low cost factor keeps the fixtures fast; bcrypt.compare reads the cost from the hash
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    userService = {
      create: vi.fn(async (data: Partial<UserFields>) =>
        makeUser({ ...data, id: 7 }),
      ),
      findByUsername: vi.fn(),
      findById: vi.fn(),
      markEmailVerified: vi.fn(),
    };
    mailService = { sendVerificationEmail: vi.fn() };
    authService = new AuthService(
      userService as unknown as UserService,
      tokenService,
      mailService as unknown as MailService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('stores a bcrypt hash of the password, never the plaintext', async () => {
      await authService.register(registration);

      const stored: string = userService.create.mock.calls[0][0].password;
      expect(stored).not.toBe(PASSWORD);
      expect(stored).toMatch(/^\$2b\$12\$/);
      expect(await bcrypt.compare(PASSWORD, stored)).toBe(true);
      expect(await bcrypt.compare('wrong password', stored)).toBe(false);
    });

    it('emails a verification token for the new user and returns no auth tokens', async () => {
      const result = await authService.register(registration);

      expect(result).toEqual({
        user: expect.objectContaining({ id: 7, username: 'alice' }),
        message: expect.any(String),
      });
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'alice',
        expect.any(String),
      );
      const token: string = mailService.sendVerificationEmail.mock.calls[0][2];
      await expect(
        tokenService.verifyEmailVerificationToken(token),
      ).resolves.toBe(7);
    });

    it('rejects a taken username with 409', async () => {
      userService.create.mockRejectedValue(new UniqueConstraintError({}));

      const error = await rejectionOf(authService.register(registration));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toHaveProperty('message', 'Username already taken');
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('still registers when the verification email cannot be sent', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      mailService.sendVerificationEmail.mockRejectedValue(
        new Error('SMTP server unavailable'),
      );

      await expect(authService.register(registration)).resolves.toHaveProperty(
        'user',
      );
    });
  });

  describe('login', () => {
    it('rejects a wrong password with 401 Invalid credentials', async () => {
      userService.findByUsername.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: true }),
      );

      const error = await rejectionOf(
        authService.login({ username: 'alice', password: 'wrong password' }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('gives an unknown username the same 401 Invalid credentials', async () => {
      userService.findByUsername.mockResolvedValue(null);

      const error = await rejectionOf(
        authService.login({ username: 'nobody', password: PASSWORD }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('rejects an unverified user who knows the password with 401 Email not verified', async () => {
      userService.findByUsername.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: false }),
      );

      const error = await rejectionOf(
        authService.login({ username: 'alice', password: PASSWORD }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Email not verified');
    });

    it('does not reveal the verification status without the right password', async () => {
      userService.findByUsername.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: false }),
      );

      const error = await rejectionOf(
        authService.login({ username: 'alice', password: 'wrong password' }),
      );
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('issues tokens to a verified user with the right password', async () => {
      userService.findByUsername.mockResolvedValue(
        makeUser({ id: 7, password: passwordHash, emailVerified: true }),
      );

      const result = await authService.login({
        username: 'alice',
        password: PASSWORD,
      });
      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        refreshExpires: expect.any(Date),
        user: expect.objectContaining({ id: 7 }),
      });
    });
  });

  describe('refresh', () => {
    it('issues a new access token for an existing user', async () => {
      userService.findById.mockResolvedValue(makeUser({ id: 7 }));

      await expect(authService.refresh(7)).resolves.toMatchObject({
        accessToken: expect.any(String),
        user: expect.objectContaining({ id: 7 }),
      });
    });

    it('rejects a user who no longer exists', async () => {
      userService.findById.mockResolvedValue(null);

      await expect(authService.refresh(7)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the user from the token as verified', async () => {
      const user = makeUser({ id: 7, emailVerified: false });
      userService.findById.mockResolvedValue(user);
      const token = await tokenService.signEmailVerificationToken(7);

      await expect(authService.verifyEmail(token)).resolves.toEqual({
        message: 'Email verified',
      });
      expect(userService.findById).toHaveBeenCalledWith(7);
      expect(userService.markEmailVerified).toHaveBeenCalledWith(user);
    });

    it('succeeds again for an already verified user without updating it', async () => {
      userService.findById.mockResolvedValue(
        makeUser({ id: 7, emailVerified: true }),
      );
      const token = await tokenService.signEmailVerificationToken(7);

      await expect(authService.verifyEmail(token)).resolves.toEqual({
        message: 'Email verified',
      });
      expect(userService.markEmailVerified).not.toHaveBeenCalled();
    });

    it('rejects an invalid token without touching the database', async () => {
      await expect(authService.verifyEmail('not-a-jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userService.findById).not.toHaveBeenCalled();
    });

    it('rejects a token for a user who no longer exists', async () => {
      userService.findById.mockResolvedValue(null);
      const token = await tokenService.signEmailVerificationToken(7);

      await expect(authService.verifyEmail(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('resendVerification', () => {
    it('emails an unverified user', async () => {
      userService.findByUsername.mockResolvedValue(
        makeUser({ emailVerified: false }),
      );

      await expect(authService.resendVerification('alice')).resolves.toEqual({
        message: RESEND_VERIFICATION_MESSAGE,
      });
      expect(mailService.sendVerificationEmail).toHaveBeenCalledOnce();
    });

    it.each([
      ['a verified user', makeUser({ emailVerified: true })],
      ['an unknown username', null],
    ])(
      'gives %s the same answer without sending an email',
      async (_label, user) => {
        userService.findByUsername.mockResolvedValue(user);

        await expect(authService.resendVerification('alice')).resolves.toEqual({
          message: RESEND_VERIFICATION_MESSAGE,
        });
        expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
      },
    );
  });
});
