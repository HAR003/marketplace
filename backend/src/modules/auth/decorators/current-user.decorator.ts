import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

// What the JWT strategies attach to req.user
export interface AuthUser {
  userId: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
