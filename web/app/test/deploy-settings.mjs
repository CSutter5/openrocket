import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
const root = await mkdtemp(resolve(tmpdir(), 'ork-deploy-settings-')), repo = resolve(import.meta.dirname, '../../..');
const secret = 'local-only-deploy-fixture-secret-2026', override = 'local-only-deploy-override-secret-2026';
try {
  const app = resolve(root, 'web/app/scripts'), commands = resolve(root, 'commands'), calls = resolve(root, 'calls.json');
  await mkdir(app, { recursive: true });await mkdir(commands);
  await copyFile(resolve(repo, 'deploy-cloudflare.sh'), resolve(root, 'deploy-cloudflare.sh'));
  await copyFile(resolve(repo, 'web/app/scripts/deploy-cloudflare.mjs'), resolve(app, 'deploy-cloudflare.mjs'));
  await writeFile(resolve(commands, 'git'), `#!${process.execPath}
const fs=require('node:fs'), path=require('node:path');let args=process.argv.slice(2);if(args[0]==='-C')args=args.slice(2);
if(args[0]==='rev-parse')console.log('1'.repeat(40));
if(args[0]==='worktree'&&args[1]==='add'){
  const target=args[3],root=process.env.ORK_DEPLOY_TEST_ROOT;
  for(const file of ['web/app/scripts/deploy-cloudflare.mjs','web/node_modules/wrangler/bin/wrangler.js']){
    fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(target,file));
  }
}
if(args[0]==='worktree'&&args[1]==='remove')fs.rmSync(args[3],{recursive:true,force:true});
`, { mode: 0o755 });
  for (const name of ['npm', 'java']) await writeFile(resolve(commands, name), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  const wrangler = resolve(root, 'web/node_modules/wrangler/bin/wrangler.js');await mkdir(resolve(wrangler, '..'), { recursive: true });
  await writeFile(wrangler, `const fs=require('node:fs');const args=process.argv.slice(2);
if(args[0]==='deploy'){
  let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{
    fs.writeFileSync(process.env.ORK_DEPLOY_TEST_CALLS,JSON.stringify({origin:args[args.indexOf('--var')+1],secretMatchesExpected:JSON.parse(input).AUTH_SECRET===process.env.ORK_DEPLOY_TEST_EXPECTED_SECRET}));
  });
}
`);
  const env = { ...process.env, PATH: commands + ':' + process.env.PATH, ORK_DEPLOY_TEST_ROOT: root, ORK_DEPLOY_TEST_CALLS: calls };
  delete env.OPENROCKET_ORIGIN;delete env.AUTH_SECRET;
  async function run(args = [], overrides = {}) {
    await rm(calls, { force: true });
    const result = spawnSync('bash', [resolve(root, 'deploy-cloudflare.sh'), ...args], { cwd: '/', env: { ...env, ORK_DEPLOY_TEST_EXPECTED_SECRET: secret, ...overrides }, encoding: 'utf8' });
    const output = result.stdout + result.stderr;assert.ok(!output.includes(secret) && !output.includes(override), 'Secret leaked into command output');
    let deployed;try { deployed = JSON.parse(await readFile(calls, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { ...result, output, deployed };
  }
  let result = await run();assert.equal(result.status, 1);assert.match(result.output, /\.env/);assert.equal(result.deployed, undefined);
  const settings = `OPENROCKET_ORIGIN=https://rocket.example.test\nAUTH_SECRET=${secret}\n`;
  await writeFile(resolve(root, '.env'), settings, { mode: 0o600 });
  for (let repeat = 0; repeat < 2; repeat++) {
    result = await run();assert.equal(result.status, 0, result.output);assert.deepEqual(result.deployed, { origin: 'AUTH_BASE_URL:https://rocket.example.test', secretMatchesExpected: true });
    assert.equal(await readFile(resolve(root, '.env'), 'utf8'), settings);
  }
  result = await run([], { OPENROCKET_ORIGIN: 'https://override.example.test', AUTH_SECRET: override, ORK_DEPLOY_TEST_EXPECTED_SECRET: override });
  assert.equal(result.status, 0, result.output);assert.deepEqual(result.deployed, { origin: 'AUTH_BASE_URL:https://override.example.test', secretMatchesExpected: true });
  await writeFile(resolve(root, '.env'), `OPENROCKET_ORIGIN=https://rocket.example.test/\nAUTH_SECRET=${secret}\n`);
  result = await run();assert.equal(result.status, 1);assert.match(result.output, /without a trailing slash/);assert.equal(result.deployed, undefined);
  await writeFile(resolve(root, '.env'), 'OPENROCKET_ORIGIN=https://rocket.example.test\nAUTH_SECRET=short\n');
  result = await run();assert.equal(result.status, 1);assert.match(result.output, /at least 32/);assert.equal(result.deployed, undefined);
  await writeFile(resolve(root, '.env'), 'exit 73\n');
  result = await run(['--dry-run']);assert.equal(result.status, 0, result.output);assert.match(result.output, /Nothing was deployed/);assert.equal(result.deployed, undefined);
  console.log('Deployment settings passed: script-relative local env, stable reuse, exported overrides, early missing/invalid setting refusal, hidden stdin secret, and credential-free dry run. Build/Cloudflare commands were isolated stubs; nothing deployed.');
} finally { await rm(root, { recursive: true, force: true }); }
