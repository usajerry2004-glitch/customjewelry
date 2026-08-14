import { SetMetadata } from '@nestjs/common';

export const API_KEY_CONFIG = 'apiKeyConfig';

export interface ApiKeyConfig {
  // Name of the ConfigService key holding the accepted secret (e.g. 'WORDPRESS_API_KEY').
  envVar: string;
  // Additional accepted keys baked into an external caller's own source
  // (e.g. a WordPress plugin) — not real secrets since they're plaintext
  // over there anyway, but still accepted so the endpoint works regardless
  // of what, if anything, is set in envVar for a given environment.
  fallbackKeys?: string[];
}

export const RequireApiKey = (envVar: string, fallbackKeys: string[] = []) =>
  SetMetadata(API_KEY_CONFIG, { envVar, fallbackKeys } as ApiKeyConfig);
