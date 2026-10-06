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
import { MailService } from '../src/modules/mail/mail.service.js';
import User from '../src/modules/user/Models/userModel.js';

// Records verification emails instead of sending them
class FakeMailService {
  readonly sent: { to: string; username: string; token: string }[] = [];

  sendVerificationEmail(to: string, username: string, token: string) {
    this.sent.push({ to, username, token });
    return Promise.resolve();
  }

  lastTokenFor(username: string): string {
    const mail = this.sent.findLast((m) => m.username === username);
    if (!mail) {
      throw new Error(`No verification email was sent to ${username}`);
    }
    return mail.token;
  }
}

// The suite runs against the dev database, so every run uses fresh usernames
// and afterAll deletes the users it created
const run = Date.now().toString(36);
const alice = `alice_${run}`;
const bob = `bob_${run}`;
const nobody = `nobody_${run}`;
const sharedEmail = `shared_${run}@example.com`;
const password = 'correct horse battery';

const setCookies = (res: request.Response): string[] =>
  res.get('Set-Cookie') ?? [];

const refreshSetCookie = (res: request.Response) =>
  setCookies(res).find((cookie) => cookie.startsWith('refresh_token='));

describe('Auth (e2e)', () => {
  let app: INestApplication | undefined;
  let config: ConfigService;
  const mail = new FakeMailService();
  const jwt = new JwtService();

  const http = () => request(app?.getHttpServer());
  const secret = (key: string) => config.getOrThrow<string>(key);
  const register = (username: string, email = sharedEmail) =>
    http().post('/auth/register').send({ username, email, password });
  const login = (username: string, pw = password) =>
    http().post('/auth/login').send({ username, password: pw });
  const verifyEmail = (token?: string) =>
    http()
      .get('/auth/verify-email')
      .query(token === undefined ? {} : { token });

  let aliceId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    config = app.get(ConfigService);
  });

  afterAll(async () => {
    if (app) {
      await User.destroy({ where: { username: [alice, bob] } });
      await app.close();
    }
  });

  describe('registration', () => {
    it('creates the account, emails a verification link and does not log the user in', async () => {
      const res = await register(alice).expect(201);

      expect(res.body.user).toMatchObject({
        username: alice,
        email: sharedEmail,
        emailVerified: false,
      });
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('accessToken');
      expect(setCookies(res)).toEqual([]);
      expect(mail.lastTokenFor(alice)).toEqual(expect.any(String));
      aliceId = res.body.user.id;
    });

    it('stores the password as a bcrypt hash', async () => {
      const row = await User.findOne({ where: { username: alice } });
      const hash = row?.password ?? '';

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2b\$12\$/);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('wrong password', hash)).toBe(false);
    });

    it('allows a second account with the same email address', async () => {
      await register(bob).expect(201);
      expect(await User.count({ where: { email: sharedEmail } })).toBe(2);
    });

    it('rejects a taken username with 409', async () => {
      const res = await register(alice, `other_${run}@example.com`).expect(409);
      expect(res.body.message).toBe('Username already taken');
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
      const res = await login(alice).expect(401);
      expect(res.body.message).toBe('Email not verified');
      expect(setCookies(res)).toEqual([]);
    });

    it('refuses a wrong password with 401 Invalid credentials', async () => {
      const res = await login(alice, 'wrong password').expect(401);
      expect(res.body.message).toBe('Invalid credentials');
      expect(setCookies(res)).toEqual([]);
    });

    it('gives an unknown username the same answer', async () => {
      const res = await login(nobody).expect(401);
      expect(res.body.message).toBe('Invalid credentials');
    });
  });

  describe('email verification', () => {
    it('rejects missing, malformed, tampered and wrongly signed tokens with 401', async () => {
      const [header, , signature] = mail.lastTokenFor(alice).split('.');
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
      const token = mail.lastTokenFor(alice);
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
      const res = await verifyEmail(mail.lastTokenFor(alice)).expect(200);

      expect(res.body).toEqual({ message: 'Email verified' });
      const row = await User.findOne({ where: { username: alice } });
      expect(row?.emailVerified).toBe(true);
    });

    it('answers 200 again for an email that is already verified', async () => {
      await verifyEmail(mail.lastTokenFor(alice)).expect(200);
    });
  });

  describe('session', () => {
    let accessToken: string;
    let refreshToken: string;

    it('logs in a verified user and sends the refresh token only as an HttpOnly cookie', async () => {
      const res = await login(alice).expect(200);

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
        where: { username: alice },
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
      const sentBefore = mail.sent.length;

      for (const username of [bob, alice, nobody]) {
        const res = await http()
          .post('/auth/resend-verification')
          .send({ username })
          .expect(200);
        expect(res.body).toEqual({ message: RESEND_VERIFICATION_MESSAGE });
      }
      expect(mail.sent.slice(sentBefore).map((m) => m.username)).toEqual([bob]);
    });

    it('sends a working token: the second account can verify and log in', async () => {
      await verifyEmail(mail.lastTokenFor(bob)).expect(200);
      await login(bob).expect(200);
    });
  });
});
