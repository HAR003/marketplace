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
import type {
  GoogleOAuthService,
  GoogleProfile,
} from './google-oauth.service.js';

const PASSWORD = 'correct horse battery';
const registration = {
  username: 'alice',
  email: 'alice@example.com',
  password: PASSWORD,
};

function googleProfile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    googleId: 'google-sub-1',
    email: 'alice@gmail.com',
    emailVerified: true,
    ...overrides,
  };
}

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
  'id' | 'username' | 'email' | 'password' | 'emailVerified' | 'googleId'
>;

function makeUser(overrides: Partial<UserFields> = {}): User {
  const fields: UserFields = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    password: '',
    emailVerified: false,
    googleId: null,
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
    | 'create'
    | 'findByEmail'
    | 'findByGoogleId'
    | 'findById'
    | 'markEmailVerified'
    | 'linkGoogleAccount',
    Mock
  >;
  let mailService: { sendVerificationEmail: Mock };
  let googleOAuthService: { getProfile: Mock };
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
      findByEmail: vi.fn(),
      findByGoogleId: vi.fn(),
      findById: vi.fn(),
      markEmailVerified: vi.fn(),
      linkGoogleAccount: vi.fn(),
    };
    mailService = { sendVerificationEmail: vi.fn() };
    googleOAuthService = { getProfile: vi.fn() };
    authService = new AuthService(
      userService as unknown as UserService,
      tokenService,
      mailService as unknown as MailService,
      googleOAuthService as unknown as GoogleOAuthService,
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

    it('rejects a taken email with 409', async () => {
      userService.create.mockRejectedValue(new UniqueConstraintError({}));

      const error = await rejectionOf(authService.register(registration));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toHaveProperty('message', 'Email already registered');
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
    const email = 'alice@example.com';

    it('rejects a wrong password with 401 Invalid credentials', async () => {
      userService.findByEmail.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: true }),
      );

      const error = await rejectionOf(
        authService.login({ email, password: 'wrong password' }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Invalid credentials');
      expect(userService.findByEmail).toHaveBeenCalledWith(email);
    });

    it('gives an unknown email the same 401 Invalid credentials', async () => {
      userService.findByEmail.mockResolvedValue(null);

      const error = await rejectionOf(
        authService.login({ email: 'nobody@example.com', password: PASSWORD }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('gives an account that only signs in with Google the same 401 Invalid credentials', async () => {
      userService.findByEmail.mockResolvedValue(
        makeUser({ password: null, emailVerified: true, googleId: 'g-1' }),
      );

      const error = await rejectionOf(
        authService.login({ email, password: PASSWORD }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('rejects an unverified user who knows the password with 401 Email not verified', async () => {
      userService.findByEmail.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: false }),
      );

      const error = await rejectionOf(
        authService.login({ email, password: PASSWORD }),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error).toHaveProperty('message', 'Email not verified');
    });

    it('does not reveal the verification status without the right password', async () => {
      userService.findByEmail.mockResolvedValue(
        makeUser({ password: passwordHash, emailVerified: false }),
      );

      const error = await rejectionOf(
        authService.login({ email, password: 'wrong password' }),
      );
      expect(error).toHaveProperty('message', 'Invalid credentials');
    });

    it('issues tokens to a verified user with the right password', async () => {
      userService.findByEmail.mockResolvedValue(
        makeUser({ id: 7, password: passwordHash, emailVerified: true }),
      );

      const result = await authService.login({
        email,
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
      userService.findByEmail.mockResolvedValue(
        makeUser({ emailVerified: false }),
      );

      await expect(
        authService.resendVerification('alice@example.com'),
      ).resolves.toEqual({ message: RESEND_VERIFICATION_MESSAGE });
      expect(userService.findByEmail).toHaveBeenCalledWith('alice@example.com');
      expect(mailService.sendVerificationEmail).toHaveBeenCalledOnce();
    });

    it.each([
      ['a verified user', makeUser({ emailVerified: true })],
      ['an unknown email', null],
    ])(
      'gives %s the same answer without sending an email',
      async (_label, user) => {
        userService.findByEmail.mockResolvedValue(user);

        await expect(
          authService.resendVerification('alice@example.com'),
        ).resolves.toEqual({ message: RESEND_VERIFICATION_MESSAGE });
        expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
      },
    );
  });

  describe('googleLogin', () => {
    it('signs in the user already linked to the Google account', async () => {
      const user = makeUser({ id: 7, googleId: 'google-sub-1' });
      googleOAuthService.getProfile.mockResolvedValue(googleProfile());
      userService.findByGoogleId.mockResolvedValue(user);

      const result = await authService.googleLogin('the-code');

      expect(googleOAuthService.getProfile).toHaveBeenCalledWith('the-code');
      expect(userService.findByGoogleId).toHaveBeenCalledWith('google-sub-1');
      expect(result).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        refreshExpires: expect.any(Date),
        user,
      });
      expect(userService.findByEmail).not.toHaveBeenCalled();
      expect(userService.create).not.toHaveBeenCalled();
      expect(userService.linkGoogleAccount).not.toHaveBeenCalled();
    });

    it('issues our own tokens for the database user id, like login', async () => {
      googleOAuthService.getProfile.mockResolvedValue(googleProfile());
      userService.findByGoogleId.mockResolvedValue(makeUser({ id: 7 }));

      const { accessToken, refreshToken } =
        await authService.googleLogin('the-code');

      const jwt = new JwtService();
      expect(jwt.decode(accessToken)).toMatchObject({ sub: 7, type: 'access' });
      expect(jwt.decode(refreshToken)).toMatchObject({
        sub: 7,
        type: 'refresh',
      });
    });

    it('links a Gmail address to the existing account with that email', async () => {
      const user = makeUser({ id: 7, email: 'alice@gmail.com' });
      googleOAuthService.getProfile.mockResolvedValue(googleProfile());
      userService.findByGoogleId.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(user);

      const result = await authService.googleLogin('the-code');

      expect(userService.findByEmail).toHaveBeenCalledWith('alice@gmail.com');
      expect(userService.linkGoogleAccount).toHaveBeenCalledWith(
        user,
        'google-sub-1',
      );
      expect(userService.create).not.toHaveBeenCalled();
      expect(result.user).toBe(user);
    });

    it('links a Google Workspace address, which Google also manages', async () => {
      const user = makeUser({ id: 7, email: 'alice@example.com' });
      googleOAuthService.getProfile.mockResolvedValue(
        googleProfile({
          email: 'alice@example.com',
          hostedDomain: 'example.com',
        }),
      );
      userService.findByGoogleId.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(user);

      await authService.googleLogin('the-code');

      expect(userService.linkGoogleAccount).toHaveBeenCalledWith(
        user,
        'google-sub-1',
      );
    });

    it('refuses to link an address Google does not manage with 409', async () => {
      googleOAuthService.getProfile.mockResolvedValue(
        googleProfile({ email: 'alice@example.com' }),
      );
      userService.findByGoogleId.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(
        makeUser({ email: 'alice@example.com' }),
      );

      const error = await rejectionOf(authService.googleLogin('the-code'));
      expect(error).toBeInstanceOf(ConflictException);
      expect(userService.linkGoogleAccount).not.toHaveBeenCalled();
    });

    it('refuses an email already linked to another Google account with 409', async () => {
      googleOAuthService.getProfile.mockResolvedValue(googleProfile());
      userService.findByGoogleId.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(
        makeUser({ email: 'alice@gmail.com', googleId: 'google-sub-other' }),
      );

      const error = await rejectionOf(authService.googleLogin('the-code'));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toHaveProperty(
        'message',
        'This email is linked to another Google account',
      );
      expect(userService.linkGoogleAccount).not.toHaveBeenCalled();
    });

    it('creates a verified user without a password, named after the email', async () => {
      googleOAuthService.getProfile.mockResolvedValue(
        googleProfile({ email: 'john@gmail.com' }),
      );
      userService.findByGoogleId.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);

      const result = await authService.googleLogin('the-code');

      expect(userService.create).toHaveBeenCalledWith({
        username: 'john',
        email: 'john@gmail.com',
        password: null,
        googleId: 'google-sub-1',
        emailVerified: true,
      });
      expect(result.user).toMatchObject({ id: 7, username: 'john' });
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('rejects a Google account whose email is not verified with 401', async () => {
      googleOAuthService.getProfile.mockResolvedValue(
        googleProfile({ emailVerified: false }),
      );

      const error = await rejectionOf(authService.googleLogin('the-code'));
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(userService.findByGoogleId).not.toHaveBeenCalled();
      expect(userService.findByEmail).not.toHaveBeenCalled();
      expect(userService.create).not.toHaveBeenCalled();
    });
  });
});
