import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './jwt.strategy.js';

// Usage: me(@CurrentUser() user: RequestUser) or @CurrentUser('userId') id: string
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
