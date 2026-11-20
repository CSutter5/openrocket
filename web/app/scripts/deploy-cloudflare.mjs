import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const app = resolve(import.meta.dirname, '..'), wrangler = resolve(app, '../node_modules/wrangler/bin/wrangler.js');
const args = process.argv.slice(2), dryRun = args.length === 1 && args[0] === '--dry-run';
if (args.length && !dryRun) throw new Error('Only --dry-run is supported');
const origin = process.env.OPENROCKET_ORIGIN, secret = process.env.AUTH_SECRET;
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Set OPENROCKET_ORIGIN to the exact HTTPS origin of this Worker, without a trailing slash');
if (!secret || secret.length < 32) throw new Error('Set AUTH_SECRET to a stable secret of at least 32 characters');
function run(command, input) {
  return new Promise(resolve => {
    // A shell pipe lets Wrangler reopen /dev/stdin; Node's direct pipe is a socket.
    const child = input
      ? spawn('bash', ['-o', 'pipefail', '-c', 'cat | "$@"', 'openrocket-deploy', process.execPath, wrangler, ...command], { cwd: app, stdio: ['pipe', 'inherit', 'inherit'] })
      : spawn(process.execPath, [wrangler, ...command], { cwd: app, stdio: 'inherit' });
    if (input) child.stdin.end(input);
    child.once('exit', code => resolve(code ?? 1));
  });
}
// /dev/stdin passes JSON through the child's pipe without a secret file or command argument.
const migrated = dryRun ? 0 : await run(['d1', 'migrations', 'apply', 'DB', '--remote']);
process.exitCode = migrated || await run(['deploy', '--var', `AUTH_BASE_URL:${origin}`, '--secrets-file', '/dev/stdin', ...(dryRun ? ['--dry-run', '--outdir', 'build/cloudflare'] : [])], JSON.stringify({ AUTH_SECRET: secret }));
