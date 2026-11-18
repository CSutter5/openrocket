import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { verifyRemoteCleanup } from './verify-remote-cleanup.mjs';

// Explicit account selection is required. This script creates only a unique,
// disposable G1 namespace and always attempts cleanup; it never upgrades a plan.
const accountFile = process.argv[2];
if (!accountFile) throw new Error('Pass a private JSON file containing accountId after explicit account selection');
const { accountId } = JSON.parse(await readFile(accountFile, 'utf8'));
if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error('Invalid selected account ID');
const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = `g1-feasibility-${randomBytes(8).toString('hex')}`;
const directory = join(root, '.wrangler', prefix);
await mkdir(join(directory, 'migrations'), { recursive: true, mode: 0o700 });
const require = createRequire(import.meta.url);
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const configPath = join(directory, 'wrangler.json');
const config = {
  name: prefix, main: '../../src/remote-smoke.ts', compatibility_date: '2026-11-17', compatibility_flags: ['nodejs_compat'],
  account_id: accountId, workers_dev: true, preview_urls: false,
  assets: { directory: '../../public', binding: 'ASSETS', run_worker_first: true },
  vars: { AUTH_BASE_URL: 'https://proof.openrocket.test' },
};
const evidence = { namespace: prefix, startedAt: new Date().toISOString(), phases: [], checks: [], cleanup: [], measurements: {}, outcome: 'pending' };
const created = { d1: false, r2: false, worker: false, blob: false };
const authSecret = randomBytes(48).toString('base64url');
const operatorSecret = randomBytes(48).toString('base64url');
const password = randomBytes(32).toString('base64url');
const fixture = { adminEmail: 'admin@g1.example.test', ownerEmail: 'owner@g1.example.test', otherEmail: 'other@g1.example.test', password };
await writeFile(join(directory, 'private-secrets.json'), JSON.stringify({ authSecret, operatorSecret, password }), { mode: 0o600 });
await copyFile(join(root, 'migrations/0001_auth.sql'), join(directory, 'migrations/0001_auth.sql'));
await copyFile(join(root, 'remote-migrations/0002_one_time_setup.sql'), join(directory, 'migrations/0002_one_time_setup.sql'));
async function saveConfig() { await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }); }
await saveConfig();
let sequence = 0;
async function cli(args, input) {
  const label = `${++sequence}-${args.slice(0, 2).join('-')}`;
  const start = performance.now();
  const child = spawn(process.execPath, [wrangler, ...args, '--config', configPath], {
    cwd: root, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'wrangler.log'), CI: 'true' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  child.stdin.end(input ?? '');
  const code = await new Promise(resolve => child.on('close', resolve));
  await writeFile(join(directory, label + '.log'), output, { mode: 0o600 });
  evidence.phases.push({ action: label, exitCode: code, wallMs: performance.now() - start });
  console.log(`${label}: ${code === 0 ? 'passed' : 'failed'}`);
  if (code !== 0) {
    // Only expose platform error codes and short known error labels; raw output
    // stays private because CLI errors may include account IDs or OAuth metadata.
    const platformCode = output.match(/\[code:\s*([\w-]+)\]/)?.[1];
    const explanation = output.includes('enable R2') ? 'R2 is not enabled for the selected account' : output.includes('permission') ? 'Cloudflare permission failure; inspect private log' : 'Inspect private phase log';
    throw new Error(`${label} failed${platformCode ? ' Cloudflare code ' + platformCode : ''}: ${explanation}`);
  }
  return output;
}
function assert(value, label) { if (!value) throw new Error('Remote assertion failed: ' + label); evidence.checks.push(label); }
let baseURL;
let tail;
let tailOutput = '';
function startTail() {
  tail = spawn(process.execPath, [wrangler, 'tail', '--format', 'json', '--config', configPath], { cwd: root, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'tail-wrangler.log'), CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
  tail.stdout.on('data', data => { tailOutput += String(data); });
  tail.stderr.on('data', data => { tailOutput += String(data); });
}
function parseTailObjects(raw) {
  let start = -1, depth = 0, quoted = false, escaped = false;
  const objects = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (start < 0) { if (char === '{') { start = i; depth = 1; } continue; }
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else {
      if (char === '"') quoted = true; else if (char === '{') depth++; else if (char === '}') depth--;
      if (depth === 0) { try { objects.push(JSON.parse(raw.slice(start, i + 1))); } catch {} start = -1; }
    }
  }
  return objects;
}
async function stopTail() {
  if (!tail) return;
  tail.kill('SIGINT');
  await Promise.race([new Promise(resolve => tail.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
  await writeFile(join(directory, 'private-tail.log'), tailOutput, { mode: 0o600 });
  evidence.tail = { outcomes: [...new Set([...tailOutput.matchAll(/"outcome"\s*:\s*"([A-Za-z]+)"/g)].map(match => match[1]))], cpuTimeMs: [...tailOutput.matchAll(/"cpuTime(?:Ms)?"\s*:\s*([0-9.]+)/g)].map(match => Number(match[1])), exceededCpuMention: /exceeded[^\n]{0,60}cpu|exceededCpu/i.test(tailOutput), memoryLimitMention: /memory limit|exceededMemory/i.test(tailOutput) };
  evidence.tail.requests = parseTailObjects(tailOutput).filter(row => row.event?.request?.url).map(row => ({ path: new URL(row.event.request.url).pathname, outcome: row.outcome, cpuTimeMs: row.cpuTime, wallTimeMs: row.wallTime }));
  tail = undefined;
}
const sockets = new Set();
async function request(path, body, cookie, origin = baseURL) {
  const start = performance.now();
  const response = await fetch(baseURL + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  evidence.measurements[path] = performance.now() - start;
  return response;
}
async function login(email) {
  const response = await request('/api/auth/sign-in/email', { email, password });
  assert(response.status === 200, 'login-' + email.split('@')[0]);
  const cookie = response.headers.get('set-cookie');
  assert(cookie?.includes('Secure') && cookie.includes('HttpOnly'), 'secure-cookie-' + email.split('@')[0]);
  await response.arrayBuffer();
  return cookie.split(';')[0];
}
function receive(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket response timed out')), 15000);
    socket.once('message', data => { clearTimeout(timeout); resolve(JSON.parse(String(data))); });
    socket.once('error', error => { clearTimeout(timeout); reject(error); });
  });
}
async function socket(cookie) {
  const ws = new WebSocket(baseURL.replace('https:', 'wss:') + '/projects/g1-project-a/ws', { headers: { Cookie: cookie, Origin: baseURL } });
  sockets.add(ws);
  return { ws, hello: await receive(ws) };
}
try {
  // A unique D1 name is created before any Worker upload; all following bindings
  // use only the names/IDs created in this run.
  const databaseOutput = await cli(['d1', 'create', `${prefix}-db`, '--update-config=false']);
  created.d1 = true;
  const databaseId = databaseOutput.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1] ?? databaseOutput.match(/database_id\s*=\s*"([a-f0-9-]+)"/)?.[1];
  if (!databaseId) throw new Error('Created D1 but could not parse its ID; cleanup uses exact created name');
  config.d1_databases = [{ binding: 'DB', database_name: `${prefix}-db`, database_id: databaseId, migrations_dir: './migrations' }];
  await saveConfig();
  await cli(['r2', 'bucket', 'create', `${prefix}-files`, '--update-config=false']);
  created.r2 = true;
  config.r2_buckets = [{ binding: 'FILES', bucket_name: `${prefix}-files` }];
  config.durable_objects = { bindings: [{ name: 'ROOMS', class_name: 'ProofRoom' }] };
  config.migrations = [{ tag: 'v1', new_sqlite_classes: ['ProofRoom'] }];
  await saveConfig();
  await cli(['d1', 'migrations', 'apply', 'DB', '--remote']);
  const table = await cli(['d1', 'execute', 'DB', '--remote', '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name='proof_remote_setup'", '--json']);
  assert(table.includes('proof_remote_setup'), 'remote-one-time-marker-table-exists');
  created.worker = true; // Attempt cleanup even if an upload partially succeeds.
  const deployed = await cli(['deploy']);
  baseURL = deployed.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];
  if (!baseURL) throw new Error('Could not determine the isolated workers.dev URL');
  evidence.measurements.hostedUpload = deployed.match(/Total Upload:.*/)?.[0];
  const startup = deployed.match(/Worker Startup Time:\s*([\d.]+)\s*ms/);
  if (startup) evidence.measurements.workerStartupMs = Number(startup[1]);
  config.vars.AUTH_BASE_URL = baseURL;
  await saveConfig();
  await cli(['deploy']);
  await cli(['secret', 'put', 'AUTH_SECRET'], authSecret);
  await cli(['secret', 'put', 'PROOF_OPERATOR_SECRET'], operatorSecret);
  // Secrets take a deployment update; retry only health, never bootstrap.
  let health;
  for (let attempt = 0; attempt < 5; attempt++) {
    health = await fetch(baseURL + '/health');
    if (health.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(health?.status === 200, 'hosted-health');
  const asset = await fetch(baseURL + '/');
  assert(asset.status === 200 && (await asset.text()).includes('G1 runtime proof'), 'hosted-static-asset');
  let ready;
  for (let attempt = 0; attempt < 10; attempt++) {
    ready = await fetch(baseURL + '/__g1/ready', { headers: { Authorization: 'Bearer ' + operatorSecret } });
    await ready.arrayBuffer();
    if (ready.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  evidence.readinessStatus = ready?.status;
  assert(ready?.status === 200, 'authenticated-current-version-and-secret-readiness');
  startTail();
  await new Promise(resolve => setTimeout(resolve, 2000));
  const setupStart = performance.now();
  const setup = await fetch(baseURL + '/__g1/setup', { method: 'POST', headers: { Authorization: 'Bearer ' + operatorSecret, 'Content-Type': 'application/json' }, body: JSON.stringify(fixture) });
  evidence.setup = { status: setup.status, wallMs: performance.now() - setupStart };
  const setupBody = await setup.text();
  let setupJson;
  try { setupJson = JSON.parse(setupBody); } catch {}
  if (setup.status !== 200) {
    evidence.setup.platformErrorCode = setupBody.match(/(?:Error(?: code)?\s*:?\s*)(1[01][0-9]{2})/i)?.[1];
    if (setupJson?.error) evidence.setup.safeError = { code: setupJson.error.code, phase: setupJson.error.phase, errorType: setupJson.error.errorType };
    const counts = await cli(['d1', 'execute', 'DB', '--remote', '--command', 'SELECT (SELECT COUNT(*) FROM proof_remote_setup) AS setup_markers, (SELECT COUNT(*) FROM user) AS users, (SELECT COUNT(*) FROM account) AS accounts', '--json']);
    try { evidence.setup.persistedCounts = JSON.parse(counts).flatMap(row => row.results); } catch { evidence.setup.persistedCounts = 'Could not parse private aggregate output'; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert(setup.status === 200, 'one-time-operator-setup');
  created.blob = true;
  const identities = setupJson;
  const adminCookie = await login(fixture.adminEmail);
  const ownerCookie = await login(fixture.ownerEmail);
  const otherCookie = await login(fixture.otherEmail);
  assert((await request('/projects/g1-project-a/files/design.ork')).status === 401, 'private-file-anonymous-denial');
  assert((await request('/projects/g1-project-a/files/design.ork', undefined, otherCookie)).status === 403, 'private-file-cross-project-denial');
  assert((await request('/projects/g1-project-a/files/design.ork', undefined, adminCookie)).status === 403, 'private-file-admin-denial');
  const downloaded = await request('/projects/g1-project-a/files/design.ork', undefined, ownerCookie);
  assert(downloaded.status === 200 && (await downloaded.text()) === 'g1 private runtime fixture', 'private-R2-owner-download');
  assert((await request('/api/auth/admin/set-role', { userId: identities.ownerId, role: 'admin' }, ownerCookie)).status === 403, 'role-escalation-denial');
  assert((await request('/api/auth/sign-out', {}, ownerCookie, 'https://attacker.test')).status === 403, 'authenticated-CSRF-origin-denial');
  const live = await socket(ownerCookie);
  assert(live.hello.sequence === 0, 'hosted-socket-initial-state');
  const command = { protocol: 1, modelSchema: 1, projectId: 'g1-project-a', branchId: 'main', epoch: 1, operationId: 'hosted-op-1', observedSequence: 0, operation: 'increment' };
  let next = receive(live.ws); live.ws.send(JSON.stringify(command));
  assert((await next).sequence === 1, 'hosted-SQLite-ack');
  live.ws.close();
  const reconnected = await socket(ownerCookie);
  assert(reconnected.hello.sequence === 1, 'hosted-reconnect-state');
  next = receive(reconnected.ws); reconnected.ws.send(JSON.stringify(command));
  const duplicate = await next;
  assert(duplicate.sequence === 1 && duplicate.duplicate === true, 'hosted-dedup');
  const banned = await request('/api/auth/admin/ban-user', { userId: identities.ownerId, banReason: 'disposable hosted proof' }, adminCookie);
  assert(banned.status === 200, 'hosted-admin-suspension');
  const closed = new Promise(resolve => { const timeout = setTimeout(() => resolve(0), 15000); reconnected.ws.once('close', code => { clearTimeout(timeout); resolve(code); }); });
  reconnected.ws.send(JSON.stringify({ ...command, operationId: 'hosted-revoked-op', observedSequence: 1 }));
  assert(await closed === 1008, 'hosted-live-socket-session-revocation');
  assert((await request('/api/auth/sign-out', {}, adminCookie)).status === 200, 'hosted-logout');
  evidence.outcome = 'passed-covered-smoke';
} catch (error) {
  evidence.outcome = 'failed';
  evidence.failure = String(error.message).replaceAll(accountId, '[account]');
  console.log(evidence.failure);
} finally {
  try { await stopTail(); }
  catch { evidence.tail = { error: 'capture-failed' }; }
  for (const ws of sockets) ws.terminate();
  if (created.worker) {
    try { await cli(['delete', prefix]); evidence.cleanup.push('worker-deleted'); }
    catch (error) { evidence.cleanup.push('worker-delete-failed'); }
  }
  if (created.r2) {
    // The setup may have written its only blob before a later failure.
    try { await cli(['r2', 'object', 'delete', `${prefix}-files/g1-project-a/design.ork`, '--remote']); } catch {}
    try { await cli(['r2', 'bucket', 'delete', `${prefix}-files`]); evidence.cleanup.push('r2-bucket-deleted'); }
    catch { evidence.cleanup.push('r2-bucket-delete-failed'); }
  }
  if (created.d1) {
    try { await cli(['d1', 'delete', `${prefix}-db`, '--skip-confirmation']); evidence.cleanup.push('d1-deleted'); }
    catch { evidence.cleanup.push('d1-delete-failed'); }
  }
  if (created.d1) {
    try { const listing = await cli(['d1', 'list', '--json']); assert(!listing.includes(`${prefix}-db`), 'cleanup-D1-absence'); }
    catch { evidence.cleanup.push('d1-absence-unverified'); }
  }
  if (created.r2) {
    try { const listing = await cli(['r2', 'bucket', 'list']); assert(!listing.includes(`${prefix}-files`), 'cleanup-R2-absence'); }
    catch { evidence.cleanup.push('r2-absence-unverified'); }
  }
  if (created.worker) {
    try { evidence.cleanupVerification = await verifyRemoteCleanup(accountId, prefix, { databaseId: config.d1_databases?.[0]?.database_id, bucketName: `${prefix}-files` });
      assert(evidence.cleanupVerification.workerAbsent, 'cleanup-Worker-absence');
      assert(evidence.cleanupVerification.exactD1Absent, 'cleanup-exact-D1-absence');
      assert(evidence.cleanupVerification.exactR2Absent, 'cleanup-exact-R2-absence');
      assert(evidence.cleanupVerification.durableObjectNamespacesRemaining === 0, 'cleanup-DO-namespace-absence');
    } catch { evidence.cleanup.push('worker-DO-absence-unverified'); }
  }
  if (evidence.cleanupVerification?.workerAbsent && evidence.cleanupVerification?.durableObjectNamespacesRemaining === 0 && !evidence.cleanup.some(item => item.includes('failed') || item.includes('unverified'))) {
    for (const file of ['private-secrets.json', 'private-tail.log']) await unlink(join(directory, file)).catch(() => {});
  }
  evidence.completedAt = new Date().toISOString();
  await writeFile(join(root, 'evidence', 'remote-runtime.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('Sanitized evidence written to evidence/remote-runtime.json. Private CLI logs/config remain ignored for cleanup review; generated secrets/raw tail are removed when cleanup is verified.');
}
if (evidence.outcome === 'failed' || evidence.cleanup.some(item => item.includes('failed') || item.includes('unverified'))) process.exitCode = 1;
