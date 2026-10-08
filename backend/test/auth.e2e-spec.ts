import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { Sequelize } from 'sequelize-typescript';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { RESEND_VERIFICATION_MESSAGE } from '../src/modules/auth/auth.service.js';
import {
  GoogleOAuthService,
  type GoogleProfile,
} from '../src/modules/auth/google-oauth.service.js';
import { MailService } from '../src/modules/mail/mail.service.js';
import User from '../src/modules/user/Models/userModel.js';

// Records verification emails instead of sending them
class FakeMailService {
  readonly sent: { to: string; username: string; token: string }[] = [];

  sendVerificationEmail(to: string, username: string, token: string) {
    this.sent.push({ to, username, token });
    return Promise.resolve();
  }

  lastTokenFor(email: string): string {
    const mail = this.sent.findLast((m) => m.to === email);
    if (!mail) {
      throw new Error(`No verification email was sent to ${email}`);
    }
    return mail.token;
  }
}

// Stands in for Google: whatever the code, it answers with the profile the test set
class FakeGoogleOAuthService {
  profile: GoogleProfile;

  getProfile(): Promise<GoogleProfile> {
    return Promise.resolve(this.profile);
  }
}

// The suite runs against the dev database, so every run uses fresh emails
// and afterAll deletes the users it created
const run = Date.now().toString(36);
const alice = `alice_${run}`;
const aliceEmail = `alice_${run}@example.com`;
// A second account with alice's username, which may repeat
const aliceTwinEmail = `alice_twin_${run}@example.com`;
const bob = `bob_${run}`;
const bobEmail = `bob_${run}@example.com`;
const nobodyEmail = `nobody_${run}@example.com`;
// Google accounts: carol signs up with Google, dave first registers with a password
const carolEmail = `carol_${run}@gmail.com`;
const dave = `dave_${run}`;
const daveEmail = `dave_${run}@gmail.com`;
const password = 'correct horse battery';

const setCookies = (res: request.Response): string[] =>
  res.get('Set-Cookie') ?? [];

const refreshSetCookie = (res: request.Response) =>
  setCookies(res).find((cookie) => cookie.startsWith('refresh_token='));

describe('Auth (e2e)', () => {
  let app: INestApplication | undefined;
  let config: ConfigService;
  const mail = new FakeMailService();
  const google = new FakeGoogleOAuthService();
  const jwt = new JwtService();

  const http = () => request(app?.getHttpServer());
  const secret = (key: string) => config.getOrThrow<string>(key);
  const register = (username: string, email: string) =>
    http().post('/auth/register').send({ username, email, password });
  const login = (email: string, pw = password) =>
    http().post('/auth/login').send({ email, password: pw });
  const verifyEmail = (token?: string) =>
    http()
      .get('/auth/verify-email')
      .query(token === undefined ? {} : { token });

  let aliceId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .overrideProvider(GoogleOAuthService)
      .useValue(google)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    config = app.get(ConfigService);
  });

  afterAll(async () => {
    if (app) {
      await User.destroy({
        where: {
          email: [aliceEmail, aliceTwinEmail, bobEmail, carolEmail, daveEmail],
        },
      });
      await app.close();
    }
  });

  describe('registration', () => {
    it('creates the account, emails a verification link and does not log the user in', async () => {
      const res = await register(alice, aliceEmail).expect(201);

      expect(res.body.user).toMatchObject({
        username: alice,
        email: aliceEmail,
        emailVerified: false,
      });
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('googleId');
      expect(res.body).not.toHaveProperty('accessToken');
      expect(setCookies(res)).toEqual([]);
      expect(mail.lastTokenFor(aliceEmail)).toEqual(expect.any(String));
      aliceId = res.body.user.id;
    });

    it('stores the password as a bcrypt hash', async () => {
      const row = await User.findOne({ where: { email: aliceEmail } });
      const hash = row?.password ?? '';

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2b\$12\$/);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('wrong password', hash)).toBe(false);
    });

    it('rejects a second account with the same email with 409', async () => {
      const res = await register(bob, aliceEmail).expect(409);
      expect(res.body.message).toBe('Email already registered');
    });

    it('allows a second account with the same username', async () => {
      await register(alice, aliceTwinEmail).expect(201);
      expect(await User.count({ where: { username: alice } })).toBe(2);
    });

    it('rejects invalid input with 400', async () => {
      await http()
        .post('/auth/register')
        .send({
          username: `x_${run}`,
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);
    });
  });

  describe('login before verification', () => {
    it('refuses an unverified user with 401 Email not verified', async () => {
      const res = await login(aliceEmail).expect(401);
      expect(res.body.message).toBe('Email not verified');
      expect(setCookies(res)).toEqual([]);
    });

    it('refuses a wrong password with 401 Invalid credentials', async () => {
      const res = await login(aliceEmail, 'wrong password').expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      expect(setCookies(res)).toEqual([]);
    });

    it('gives an unknown email the same answer', async () => {
      const res = await login(nobodyEmail).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
    });
  });

  describe('email verification', () => {
    it('rejects missing, malformed, tampered and wrongly signed tokens with 401', async () => {
      const [header, , signature] = mail.lastTokenFor(aliceEmail).split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ sub: aliceId, type: 'email_verification' }),
      ).toString('base64url');
      const wronglySigned = await jwt.signAsync(
        { sub: aliceId, type: 'email_verification' },
        { secret: 'not-the-real-secret' },
      );

      await verifyEmail().expect(401);
      for (const token of [
        'garbage',
        `${header}.${forgedPayload}.${signature}`,
        wronglySigned,
      ]) {
        await verifyEmail(token).expect(401);
      }
    });

    it('rejects an expired token with 401', async () => {
      const expired = await jwt.signAsync(
        {
          sub: aliceId,
          type: 'email_verification',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        { secret: secret('JWT_EMAIL_VERIFICATION_SECRET') },
      );
      await verifyEmail(expired).expect(401);
    });

    it('cannot be used as an access token or as a refresh token', async () => {
      const token = mail.lastTokenFor(aliceEmail);
      await http()
        .get('/user/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${token}`)
        .expect(401);
    });

    it('verifies the email with the emailed token', async () => {
      const res = await verifyEmail(mail.lastTokenFor(aliceEmail)).expect(200);

      expect(res.body).toEqual({ message: 'Email verified' });
      const row = await User.findOne({ where: { email: aliceEmail } });
      expect(row?.emailVerified).toBe(true);
    });

    it('answers 200 again for an email that is already verified', async () => {
      await verifyEmail(mail.lastTokenFor(aliceEmail)).expect(200);
    });
  });

  describe('session', () => {
    let accessToken: string;
    let refreshToken: string;

    it('logs in a verified user and sends the refresh token only as an HttpOnly cookie', async () => {
      const res = await login(aliceEmail).expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        user: expect.objectContaining({ username: alice, emailVerified: true }),
      });
      expect(res.body.user).not.toHaveProperty('password');

      const cookie = refreshSetCookie(res) ?? '';
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/auth/);
      accessToken = res.body.accessToken;
      refreshToken = cookie.split(';')[0].slice('refresh_token='.length);
      expect(refreshToken).not.toBe('');
    });

    it('protects /user/me with the access token', async () => {
      await http().get('/user/me').expect(401);

      const res = await http()
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ id: aliceId, username: alice });
      expect(res.body).not.toHaveProperty('password');
    });

    it('does not accept the refresh token as an access token', async () => {
      await http()
        .get('/user/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });

    it('refreshes the access token with the refresh cookie', async () => {
      const res = await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(200);

      expect(res.body.user).toMatchObject({ username: alice });
      // The cookie keeps its original expiry; refresh issues no new one
      expect(refreshSetCookie(res)).toBeUndefined();
      await http()
        .get('/user/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('accepts any valid refresh JWT, even one the server never issued', async () => {
      const minted = await jwt.signAsync(
        { sub: aliceId, type: 'refresh' },
        { secret: secret('JWT_REFRESH_SECRET'), expiresIn: '7d' },
      );
      await http()
        .post('/auth/refresh')
        .set('Cookie', `refresh_token=${minted}`)
        .expect(200);
    });

    it('rejects access and refresh tokens at /auth/verify-email', async () => {
      await verifyEmail(accessToken).expect(401);
      await verifyEmail(refreshToken).expect(401);
    });

    it('stores no token in the database', async () => {
      const row = await User.findOne({
        where: { email: aliceEmail },
        raw: true,
      });
      const storedValues = JSON.stringify(row);
      expect(storedValues).not.toContain(accessToken);
      expect(storedValues).not.toContain(refreshToken);

      const tables = await app
        ?.get(Sequelize)
        .getQueryInterface()
        .showAllTables();
      expect(
        (tables ?? []).filter((table) =>
          String(table).toLowerCase().includes('token'),
        ),
      ).toEqual([]);
    });

    it('logs out by clearing the cookie', async () => {
      const res = await http()
        .post('/auth/logout')
        .set('Cookie', `refresh_token=${refreshToken}`)
        .expect(204);

      const cleared = refreshSetCookie(res) ?? '';
      expect(cleared).toMatch(/^refresh_token=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      await http().post('/auth/refresh').expect(401);
    });
  });

  describe('resend-verification', () => {
    it('gives every account the same answer and only emails unverified ones', async () => {
      await register(bob, bobEmail).expect(201);
      const sentBefore = mail.sent.length;

      for (const email of [bobEmail, aliceEmail, nobodyEmail]) {
        const res = await http()
          .post('/auth/resend-verification')
          .send({ email })
          .expect(200);
        expect(res.body).toEqual({ message: RESEND_VERIFICATION_MESSAGE });
      }
      expect(mail.sent.slice(sentBefore).map((m) => m.to)).toEqual([bobEmail]);
    });

    it('sends a working token: the second account can verify and log in', async () => {
      await verifyEmail(mail.lastTokenFor(bobEmail)).expect(200);
      await login(bobEmail).expect(200);
    });
  });

  describe('Google sign-in', () => {
    const googleLogin = (profile: GoogleProfile) => {
      google.profile = profile;
      return http().post('/auth/google').send({ code: 'code-from-google' });
    };
    const carol: GoogleProfile = {
      googleId: `google_carol_${run}`,
      email: carolEmail,
      emailVerified: true,
    };
    let carolId: number;

    it('creates a verified account without a password, named after the email, and starts a session', async () => {
      const res = await googleLogin(carol).expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        user: expect.objectContaining({
          username: `carol_${run}`,
          email: carolEmail,
          emailVerified: true,
        }),
      });
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('googleId');

      const cookie = refreshSetCookie(res) ?? '';
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/auth/);
      await http()
        .get('/user/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);

      const row = await User.findOne({ where: { email: carolEmail } });
      expect(row?.googleId).toBe(carol.googleId);
      expect(row?.password).toBeNull();
      carolId = res.body.user.id;
    });

    it('signs the same Google account in again without creating another user', async () => {
      const res = await googleLogin(carol).expect(200);

      expect(res.body.user.id).toBe(carolId);
      expect(await User.count({ where: { email: carolEmail } })).toBe(1);
    });

    it('refuses a password login for an account that only uses Google', async () => {
      const res = await login(carolEmail).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('links a verified password account, which keeps its password', async () => {
      // alice's example.com address stands in for a Google Workspace domain here
      const res = await googleLogin({
        googleId: `google_alice_${run}`,
        email: aliceEmail,
        emailVerified: true,
        hostedDomain: 'example.com',
      }).expect(200);

      expect(res.body.user.id).toBe(aliceId);
      const row = await User.findOne({ where: { email: aliceEmail } });
      expect(row?.googleId).toBe(`google_alice_${run}`);
      await login(aliceEmail).expect(200);
    });

    it('links an unverified account and removes the password it was registered with', async () => {
      await register(dave, daveEmail).expect(201);

      await googleLogin({
        googleId: `google_dave_${run}`,
        email: daveEmail,
        emailVerified: true,
      }).expect(200);

      const row = await User.findOne({ where: { email: daveEmail } });
      expect(row?.googleId).toBe(`google_dave_${run}`);
      expect(row?.emailVerified).toBe(true);
      expect(row?.password).toBeNull();
      const res = await login(daveEmail).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('refuses to link an address Google does not manage with 409', async () => {
      const res = await googleLogin({
        googleId: `google_bob_${run}`,
        email: bobEmail,
        emailVerified: true,
      }).expect(409);

      expect(res.body.message).toBe(
        'An account with this email already exists. Log in with your password.',
      );
      const row = await User.findOne({ where: { email: bobEmail } });
      expect(row?.googleId).toBeNull();
    });

    it('rejects a request without a code with 400', async () => {
      await http().post('/auth/google').send({}).expect(400);
    });
  });

  describe('CORS', () => {
    it('lets the frontend call the API with cookies', async () => {
      const frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
      const res = await http()
        .options('/auth/login')
        .set('Origin', frontendUrl)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(res.get('Access-Control-Allow-Origin')).toBe(frontendUrl);
      expect(res.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });
});
