import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export async function verifyRemoteCleanup(accountId, prefix, resources = {}) {
  if (!/^g1-feasibility-[a-f0-9]{16}$/.test(prefix)) throw new Error('Cleanup verification requires this proof namespace');
  const require = createRequire(import.meta.url);
  const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
  const credentials = JSON.parse(execFileSync(process.execPath, [wrangler, 'auth', 'token', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '/tmp/openrocket-g1-cleanup.log' } }));
  const api = async path => {
    const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + path, { headers: { Authorization: 'Bearer ' + credentials.token } });
    return { status: response.status, json: await response.json() };
  };
  const worker = await api('/workers/scripts/' + prefix);
  let cursor, page = 1, namespaceRowsInspected = 0, ownedNamespaceCount = 0, paginationComplete = false;
  const seen = new Set();
  while (!paginationComplete) {
    const parameters = new URLSearchParams({ per_page: '100', ...(cursor ? { cursor } : { page: String(page) }) });
    const namespaces = await api('/workers/durable_objects/namespaces?' + parameters);
    if (!namespaces.json.success) throw new Error('Cannot verify DO namespace cleanup');
    const rows = namespaces.json.result;
    for (const row of rows) {
      if (seen.has(row.id)) throw new Error('Namespace API pagination repeated; cleanup cannot be certified');
      seen.add(row.id);
      if (row.script === prefix || row.script_name === prefix || row.name?.includes(prefix)) ownedNamespaceCount++;
    }
    namespaceRowsInspected += rows.length;
    const info = namespaces.json.result_info;
    const perPage = info?.per_page ?? 100;
    paginationComplete = rows.length < perPage || (info?.total_pages !== undefined && page >= info.total_pages);
    cursor = info?.cursor;
    page++;
  }
  const d1 = resources.databaseId ? await api('/d1/database/' + resources.databaseId) : undefined;
  const r2 = resources.bucketName ? await api('/r2/buckets/' + resources.bucketName) : undefined;
  return { workerAbsent: worker.status === 404 && worker.json.errors?.some(error => error.code === 10007), durableObjectNamespacesRemaining: ownedNamespaceCount, namespaceRowsInspected, namespacePaginationComplete: paginationComplete, ...(d1 ? { exactD1LookupStatus: d1.status, exactD1Absent: d1.status === 404 } : {}), ...(r2 ? { exactR2LookupStatus: r2.status, exactR2Absent: r2.status === 404 } : {}) };

}
