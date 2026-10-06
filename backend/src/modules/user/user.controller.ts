import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator.js';
import { UserService } from './user.service.js';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async me(@CurrentUser() currentUser: AuthUser) {
    const user = await this.userService.findById(currentUser.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
