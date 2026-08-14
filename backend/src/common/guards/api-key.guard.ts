import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { API_KEY_CONFIG, ApiKeyConfig } from '../decorators/require-api-key.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const keyConfig = this.reflector.getAllAndOverride<ApiKeyConfig>(API_KEY_CONFIG, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!keyConfig) {
      // No @RequireApiKey() on this route — nothing to check.
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-api-key'];
    const configured = this.config.get<string>(keyConfig.envVar, '');
    const accepted = [configured, ...(keyConfig.fallbackKeys || [])].filter(Boolean);

    if (!provided || !accepted.includes(provided)) {
      this.logger.warn(`Request rejected — invalid API key for ${keyConfig.envVar}`);
      throw new ForbiddenException('Invalid API key');
    }
    return true;
  }
}
