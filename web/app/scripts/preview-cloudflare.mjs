import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const app = resolve(import.meta.dirname, '..'), wrangler = resolve(app, '../node_modules/wrangler/bin/wrangler.js');
const env = { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(48).toString('base64url') };
if (!process.env.AUTH_SECRET) console.log('Using a temporary development auth secret; sign in again after restarting this preview.');
function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: app, env, stdio: 'inherit' });
    const stop = () => child.kill('SIGTERM');process.once('SIGINT', stop);process.once('SIGTERM', stop);
    child.once('exit', code => { process.removeListener('SIGINT', stop);process.removeListener('SIGTERM', stop);resolve(code ?? 1); });
  });
}
const migrated = await run(['d1', 'migrations', 'apply', 'DB', '--local']);
process.exitCode = migrated || await run(['dev', '--local', '--ip', '127.0.0.1', '--port', '8787']);
