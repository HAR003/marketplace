import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { GoogleLoginDto } from '../../dtos/google-login.dto.js';
import { LoginDto } from '../../dtos/login.dto.js';
import { RegisterDto } from '../../dtos/register.dto.js';
import { ResendVerificationDto } from '../../dtos/resend-verification.dto.js';
import { AuthService } from './auth.service.js';
import {
  CurrentUser,
  type AuthUser,
} from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

type Session = Awaited<ReturnType<AuthService['login']>>;

@Public()
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.get<string>('NODE_ENV') === 'production';
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(res, await this.authService.login(body));
  }

  // Called by the frontend's /auth/google/callback page (in the sign-in popup)
  // with the code Google sent there
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Body() body: GoogleLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.startSession(
      res,
      await this.authService.googleLogin(body.code),
    );
  }

  // Issues a new access token only; the cookie keeps its original expiry
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  refresh(@CurrentUser() currentUser: AuthUser) {
    return this.authService.refresh(currentUser.userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(
      REFRESH_COOKIE_NAME,
      refreshCookieOptions(this.secureCookies),
    );
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token?: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }

  // Shared by both ways of logging in, so they set exactly the same cookie
  private startSession(
    res: Response,
    { accessToken, refreshToken, refreshExpires, user }: Session,
  ) {
    // The refresh token only ever travels in this HttpOnly cookie
    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      refreshCookieOptions(this.secureCookies, refreshExpires),
    );
    return { accessToken, user };
  }
}
