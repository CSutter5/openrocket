import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const app = resolve(import.meta.dirname, '..');

for (const initial of [0, 1]) {
  const storage = await mkdtemp(resolve(tmpdir(), 'ork-password-upgrade-'));
  async function execute(args) {
    const { stdout } = await promisify(execFile)(process.execPath, [resolve(app, '../node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--local', '--persist-to', storage, '--json', ...args],
      { cwd: app, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(storage, 'logs'), CI: '1' } });
    return JSON.parse(stdout);
  }
  try {
    for (const migration of ['0001_accounts_and_rockets.sql', '0002_admin_and_deletion.sql', '0003_sharing.sql', '0004_preferences.sql']) await execute(['--file', 'migrations/' + migration]);
    await execute(['--command', `UPDATE app_admin SET must_change_password=${initial};
      INSERT INTO user(id,name,email,email_verified,created_at,updated_at,username) VALUES ('legacy','Legacy','legacy@example.test',0,1,1,'legacy');
      INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES ('kept',9999999999999,'unchanged-session',1,1,'legacy');`]);
    const before = (await execute(['--command', 'SELECT id,password FROM account']))[0].results;
    await execute(['--file', 'migrations/0005_temporary_passwords.sql']);
    assert.deepEqual((await execute(['--command', 'SELECT username,must_change_password FROM user ORDER BY username']))[0].results, [
      { username: 'admin', must_change_password: initial }, { username: 'legacy', must_change_password: 0 },
    ]);
    assert.deepEqual((await execute(['--command', 'SELECT id,password FROM account']))[0].results, before);
    assert.deepEqual((await execute(['--command', 'SELECT id,token FROM session']))[0].results, [{ id: 'kept', token: 'unchanged-session' }]);
    assert.deepEqual((await execute(['--command', 'PRAGMA foreign_key_check']))[0].results, []);
  } finally { await rm(storage, { recursive: true, force: true }); }
}
console.log('Temporary-password migration passed in local D1: completed/unfinished admin setup preserved, ordinary accounts unrestricted, credentials/sessions unchanged and foreign keys valid.');
