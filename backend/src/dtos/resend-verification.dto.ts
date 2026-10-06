import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { trim } from './transforms.js';

export class ResendVerificationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  username: string;
}
