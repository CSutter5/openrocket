import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const app = resolve(import.meta.dirname, '..'), storage = await mkdtemp(resolve(tmpdir(), 'ork-sharing-upgrade-'));
async function execute(args) {
  const { stdout } = await promisify(execFile)(process.execPath, [resolve(app, '../node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--local', '--persist-to', storage, '--json', ...args],
    { cwd: app, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: resolve(storage, 'logs'), CI: '1' } });
  return JSON.parse(stdout);
}
try {
  for (const migration of ['0001_accounts_and_rockets.sql', '0002_admin_and_deletion.sql']) await execute(['--file', 'migrations/' + migration]);
  await execute(['--command', `INSERT INTO user(id,name,email,email_verified,created_at,updated_at,username) VALUES ('legacy','Legacy','legacy@example.test',0,1,1,'legacy');
    INSERT INTO rocket(id,owner_id,name,slug,created_at,deleted_at) VALUES ('kept','legacy','Preserved','same-slug',123,NULL), ('tombstone','legacy','Deleted','deleted',124,456);`]);
  await execute(['--file', 'migrations/0003_sharing.sql']);
  const [{ results }] = await execute(['--command', 'SELECT * FROM rocket ORDER BY created_at']);
  assert.deepEqual(results, [
    { id: 'kept', owner_id: 'legacy', name: 'Preserved', slug: 'same-slug', created_at: 123, deleted_at: null, route_username: 'legacy', visibility: 'public', public_download: 1, sharing_version: 0 },
    { id: 'tombstone', owner_id: 'legacy', name: 'Deleted', slug: 'deleted', created_at: 124, deleted_at: 456, route_username: 'legacy', visibility: 'public', public_download: 1, sharing_version: 0 },
  ]);
  await execute(['--command', `INSERT INTO rocket(id,owner_id,name,slug,created_at,route_username) VALUES ('new','legacy','New','new',999,'legacy');
    INSERT INTO rocket_member(rocket_id,user_id,role,can_download) VALUES ('new','00000000-0000-4000-8000-0000000000ad','viewer',0);`]);
  assert.deepEqual((await execute(['--command', "SELECT visibility,public_download FROM rocket WHERE id='new'"]))[0].results, [{ visibility: 'restricted', public_download: 0 }]);
  await execute(['--command', "DELETE FROM rocket WHERE id='new'"]);
  assert.deepEqual((await execute(['--command', 'SELECT * FROM rocket_member']))[0].results, []);
  await execute(['--command', "UPDATE user SET deleting=1 WHERE id='legacy'"]);
  await assert.rejects(execute(['--command', "UPDATE rocket SET owner_id='legacy' WHERE id='kept'"]), error => error.code === 1 && /New owner is unavailable/.test(error.stdout));
  assert.deepEqual((await execute(['--command', 'PRAGMA foreign_key_check']))[0].results, []);
  console.log('Sharing migration passed in local D1: existing public metadata/URLs/tombstones preserved, restricted creation defaults, membership cascade, unavailable-owner refusal and foreign-key consistency.');
} finally { await rm(storage, { recursive: true, force: true }); }
