import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { admin } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import type { Bindings } from './index';

export function authentication(env: Bindings) {
  return betterAuth({
    baseURL: 'https://proof.openrocket.test',
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: 'sqlite', schema, transaction: false }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { expiresIn: 3600, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: true },
    plugins: [admin()],
  });
}

// Test/operator entry point only; deliberately has no HTTP route. A deployed bootstrap
// must authenticate the operator separately and serialize the one-time ceremony.
export async function bootstrapOperator(env: Bindings, email: string, password: string) {
  const existing = await env.DB.prepare('SELECT admin_id FROM proof_operator WHERE id = 1').first();
  if (existing) throw new Error('Operator already bootstrapped');
  const result = await authentication(env).api.createUser({ body: { email, password, name: 'Explicit local operator', role: 'admin' } });
  await env.DB.prepare('INSERT INTO proof_operator (id, admin_id) VALUES (1, ?)').bind(result.user.id).run();
  return result.user;
}
