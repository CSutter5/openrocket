import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { username } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Env } from './env';
const reserved = new Set(['api', 'assets', 'motors', 'admin']);
export function validUsername(value: string) { return /^[a-z][a-z0-9_-]{2,31}$/.test(value) && !reserved.has(value); }
export function authentication(env: Env) {
  if (!env.AUTH_SECRET || !env.AUTH_BASE_URL) throw new Error('Account service is not configured');
  return betterAuth({
    baseURL: env.AUTH_BASE_URL,
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema, transaction: false }),
    emailAndPassword: { enabled: true },
    session: { expiresIn: 7 * 24 * 3600, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: env.AUTH_BASE_URL.startsWith('https:') },
    telemetry: { enabled: false },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 32, usernameValidator: validUsername,
      usernameNormalization: value => value.toLowerCase(), validationOrder: { username: 'post-normalization' } })],
  });
}
