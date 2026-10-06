import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { EMAIL_VERIFICATION_TTL_MINUTES } from '../token/token.service.js';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    const port = Number(config.getOrThrow<string>('MAIL_PORT'));
    const user = config.get<string>('MAIL_USER');
    this.transporter = createTransport({
      host: config.getOrThrow<string>('MAIL_HOST'),
      port,
      secure: port === 465,
      // Local servers such as Mailpit don't need credentials
      auth: user
        ? { user, pass: config.get<string>('MAIL_PASSWORD') ?? '' }
        : undefined,
    });
    this.from = config.getOrThrow<string>('MAIL_FROM');
    this.appUrl = config.getOrThrow<string>('APP_URL');
  }

  // One address can own several accounts, so the email names the account it verifies
  async sendVerificationEmail(
    to: string,
    username: string,
    token: string,
  ): Promise<void> {
    const link = `${this.appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const expiry = `The link expires in ${EMAIL_VERIFICATION_TTL_MINUTES} minutes. If you didn't create this account, you can ignore this email.`;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Verify your email address',
      text: [
        `Hi ${username},`,
        '',
        `Open this link to verify the email address of your Marketplace account "${username}":`,
        link,
        '',
        expiry,
      ].join('\n'),
      html: [
        `<p>Hi ${username},</p>`,
        `<p>Click the link below to verify the email address of your Marketplace account <strong>${username}</strong>.</p>`,
        `<p><a href="${link}">Verify email address</a></p>`,
        `<p>${expiry}</p>`,
      ].join('\n'),
    });
  }
}
