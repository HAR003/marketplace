import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { trimAndLowercase } from './transforms.js';

export class ResendVerificationDto {
  @Transform(trimAndLowercase)
  @IsEmail()
  email: string;
}
