import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TIMEOUT_MS = 10_000;

export interface GoogleProfile {
  // Google's stable account id (the `sub` claim)
  googleId: string;
  email: string;
  emailVerified: boolean;
  // Set for Google Workspace accounts: the domain the address belongs to
  hostedDomain?: string;
}

interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  hd?: string;
}

// The only code that talks to Google. It trades the authorization code the
// frontend received for the Google account's identity. Google's own tokens are
// used once and never stored.
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    // Must equal the redirect_uri the frontend sent to Google, or Google refuses the code
    this.redirectUri = `${config.getOrThrow<string>('FRONTEND_URL')}/auth/google/callback`;
  }

  async getProfile(code: string): Promise<GoogleProfile> {
    let response: Response;
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        body: new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        'Could not reach Google',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        "Can't reach Google right now. Please try again.",
      );
    }
    // A wrong, expired or already used code, or wrong client credentials
    if (!response.ok) {
      this.logger.warn(
        `Google refused the authorization code: ${await response.text()}`,
      );
      throw new UnauthorizedException('Google sign-in failed');
    }

    const { id_token: idToken } = (await response.json()) as {
      id_token: string;
    };
    // This ID token came straight from Google's token endpoint over HTTPS, in
    // answer to our client secret, so Google's OpenID Connect docs allow
    // reading it without checking its signature
    const claims = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString(),
    ) as GoogleIdTokenClaims;
    return {
      googleId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      hostedDomain: claims.hd,
    };
  }
}
