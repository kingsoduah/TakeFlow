import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_KEY_HEADER } from './api-key.constants.js';
import { ApiKeyPrincipal, ApiKeysService } from './api-keys.service.js';

type KeyedRequest = Request & { apiKey?: ApiKeyPrincipal };

// Authenticates a shop's server by its TakeFlow API key in the X-Api-Key
// header. The key decides the business; nothing in the request can point at
// another one.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<KeyedRequest>();
    const header = request.headers[API_KEY_HEADER.toLowerCase()];
    const presented = typeof header === 'string' ? header.trim() : '';
    if (!presented) {
      throw new UnauthorizedException(`Missing API key. Send it in the ${API_KEY_HEADER} header.`);
    }
    const principal = await this.apiKeys.verify(presented);
    if (!principal) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }
    request.apiKey = principal;
    return true;
  }
}

// The business id of the authenticated API key.
export const ApiKeyBusiness = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<KeyedRequest>();
  return request.apiKey?.businessId;
});
