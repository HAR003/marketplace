import { IsNotEmpty, IsString } from 'class-validator';

// The one-time authorization code Google gave the frontend's /auth/google/callback page
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
