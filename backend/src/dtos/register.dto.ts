import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim, trimAndLowercase } from './transforms.js';

export class RegisterDto {
  // The character limit also keeps usernames safe to put into email HTML
  @Transform(trim)
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'username may only contain letters, numbers, ".", "_" and "-"',
  })
  username: string;

  @Transform(trimAndLowercase)
  @IsEmail()
  email: string;

  // bcrypt ignores everything after the first 72 bytes
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
