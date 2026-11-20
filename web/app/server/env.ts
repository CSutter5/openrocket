import type * as CF from '@cloudflare/workers-types';
export interface Env {
  ASSETS: CF.Fetcher;
  SHARED_ROCKET: CF.DurableObjectNamespace;
  DB: CF.D1Database;
  AUTH_SECRET: string;
  AUTH_BASE_URL: string;
}
export interface SocketIdentity { rocketId: string; username: string; sessionId?: string; userId?: string }
