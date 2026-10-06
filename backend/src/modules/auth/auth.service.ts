import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { UniqueConstraintError } from 'sequelize';
import type { LoginDto } from '../../dtos/login.dto.js';
import type { RegisterDto } from '../../dtos/register.dto.js';
import { MailService } from '../mail/mail.service.js';
import { TokenService } from '../token/token.service.js';
import type User from '../user/Models/userModel.js';
import { UserService } from '../user/user.service.js';

export const BCRYPT_SALT_ROUNDS = 12;

export const RESEND_VERIFICATION_MESSAGE =
  'If the account exists and is not verified yet, a new verification email has been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    let user: User;
    try {
      user = await this.userService.create({
        username: dto.username,
        email: dto.email,
        password: passwordHash,
      });
    } catch (error) {
      // username is the only unique column; emails may repeat across accounts
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException('Username already taken');
      }
      throw error;
    }

    await this.sendVerificationEmail(user);
    // No tokens here: login requires a verified email
    return {
      user,
      message: 'Registered. Check your email to verify your account.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userService.findByUsername(dto.username);
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Checked only after the password, so only the account owner learns this
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const tokens = await this.tokenService.issueAuthTokens(user.id);
    return { ...tokens, user };
  }

  async refresh(userId: number) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      accessToken: await this.tokenService.signAccessToken(user.id),
      user,
    };
  }

  async verifyEmail(token: string | undefined) {
    const userId = await this.tokenService.verifyEmailVerificationToken(token);
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
    if (!user.emailVerified) {
      await this.userService.markEmailVerified(user);
    }
    return { message: 'Email verified' };
  }

  // Same answer whether or not the account exists or is verified
  async resendVerification(username: string) {
    const user = await this.userService.findByUsername(username);
    if (user && !user.emailVerified) {
      await this.sendVerificationEmail(user);
    }
    return { message: RESEND_VERIFICATION_MESSAGE };
  }

  // A failed send doesn't fail the request; the user can ask for a new email
  private async sendVerificationEmail(user: User) {
    try {
      const token = await this.tokenService.signEmailVerificationToken(user.id);
      await this.mailService.sendVerificationEmail(
        user.email,
        user.username,
        token,
      );
    } catch (error) {
      this.logger.error(
        `Could not send the verification email for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
