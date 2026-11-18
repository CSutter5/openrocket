import { spawn, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// This measures a local dev process, not Cloudflare's isolate CPU/memory budgets.
const root = fileURLToPath(new URL('../', import.meta.url));
const port = 8789;
const require = createRequire(import.meta.url);
const wrangler = join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
const start = performance.now();
const server = spawn(process.execPath, [wrangler, 'dev', '--local', '--port', String(port), '--inspector-port', '9239'], {
  cwd: root,
  detached: true,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '/tmp/openrocket-g1-local-measure.log' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
const clockTicks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
async function runtimeProcesses() {
  const rows = execFileSync('ps', ['-eo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' }).trim().split('\n').map(line => line.trim().split(/\s+/));
  const owned = new Set([server.pid]);
  for (let i = 0; i < rows.length; i++) {
    for (const row of rows) if (owned.has(Number(row[1]))) owned.add(Number(row[0]));
  }
  return Promise.all(rows.filter(row => owned.has(Number(row[0])) && row[3] === 'workerd').map(async row => {
    const stat = await readFile(`/proc/${row[0]}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid: Number(row[0]), rssKiB: Number(row[2]), cpuMs: (Number(fields[11]) + Number(fields[12])) * 1000 / clockTicks };
  }));
}
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Local Worker failed to start: ${output.slice(-2000)}`)), 30000);
    const consume = chunk => {
      output += String(chunk);
      if (output.includes('Ready on')) { clearTimeout(timeout); resolve(); }
    };
    server.stdout.on('data', consume);
    server.stderr.on('data', consume);
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Wrangler exited ${code}: ${output.slice(-2000)}`)); });
  });
  const cliReadyMs = performance.now() - start;
  const healthStart = performance.now();
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  if (health.status !== 200 || (await health.json()).runtime !== 'workers') throw new Error('Health check failed');
  const firstHealthMs = performance.now() - healthStart;
  const asset = await fetch(`http://127.0.0.1:${port}/`);
  if (asset.status !== 200 || !(await asset.text()).includes('OpenRocket G1 runtime proof')) throw new Error('Static assets failed');
  const before = await runtimeProcesses();
  if (!before.length) throw new Error('No owned workerd process found');
  const requestStart = performance.now();
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (response.status !== 200) throw new Error('Repeated health request failed');
    await response.arrayBuffer();
  }
  const hundredHealthWallMs = performance.now() - requestStart;
  const after = await runtimeProcesses();
  const processCpuMs = after.reduce((sum, row) => sum + row.cpuMs - (before.find(previous => previous.pid === row.pid)?.cpuMs ?? row.cpuMs), 0);
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), cliReadyMs, firstHealthMs, hundredHealthWallMs, hundredHealthWorkerdProcessCpuMs: processCpuMs, workerdProcessRssKiB: after.map(row => row.rssKiB), caveat: 'Local Linux workerd processes including Miniflare dev services; startup includes Wrangler/build. These are not production isolate CPU/memory measurements.' }, null, 2));
} finally {
  process.kill(-server.pid, 'SIGTERM');
}
