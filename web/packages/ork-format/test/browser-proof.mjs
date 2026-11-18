import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, relative, resolve } from 'node:path';
const output = process.argv[2] ?? '/tmp/openrocket-ork-browser-proof';
await mkdir(output, { recursive: true });
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))], bundle: true,
  format: 'esm', platform: 'browser', write: false });
const repo = new URL('../../../../', import.meta.url);
const source = process.env.ORK_PROOF_INPUT || fileURLToPath(new URL('core/src/main/resources/datafiles/examples/A simple model rocket.ork', repo));
const fixture = await readFile(source);
const server = createServer((req,res) => {
  if (req.url === '/codec.js') { res.setHeader('Content-Type','text/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url === '/fixture.ork') res.end(fixture);
  else { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>ORK feasibility proof</title>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const codec = await import('/codec.js');
    const start = performance.now();
    const bytes = new Uint8Array(await (await fetch('/fixture.ork')).arrayBuffer());
    const original = await codec.importArchive(bytes);
    const target = codec.componentNames(original).find(c=>c.type==='bodytube');
    if (!target) throw Error('Fixture has no body tube to edit');
    const changed = await codec.renameComponent(original,target.id,target.name,'Browser <proof>');
    const exported = await codec.exportArchive(changed);
    const reimported = await codec.importArchive(exported.bytes,exported.identity);
    if (codec.componentNames(reimported).find(c=>c.id===target.id)?.name !== 'Browser <proof>') throw Error('Name/ID lost');
    if (JSON.stringify(original.entries.slice(1).map(e=>e.sha256)) !== JSON.stringify(reimported.entries.slice(1).map(e=>e.sha256))) throw Error('Asset hashes changed');
    if (JSON.stringify(exported.identity)!==JSON.stringify(reimported.identity)) throw Error('Sidecar changed');
    if (reimported.parsed.simulations.length!==original.parsed.simulations.length) throw Error('Stored simulations lost');
    if (JSON.stringify(codec.componentNames(original).map(c=>c.id)) !== JSON.stringify(codec.componentNames(reimported).map(c=>c.id))) throw Error('Component identities changed');
    const nameNode = original.parsed.components.find(c=>c.id===target.id).nameNode;
    const expectedXml = original.xml.slice(0,nameNode.contentStart) + 'Browser &lt;proof&gt;' + original.xml.slice(nameNode.contentEnd);
    if (reimported.xml !== expectedXml) throw Error('XML changed beyond requested name');
    const unchanged = (await codec.exportArchive(original)).bytes;
    if (unchanged.length !== bytes.length || !unchanged.every((byte,i)=>byte===bytes[i])) throw Error('Original bytes changed');
    if (await codec.sha256((await codec.exportArchive(changed)).bytes) !== await codec.sha256(exported.bytes)) throw Error('Changed export is not deterministic');
    return {durationMs:performance.now()-start, inputBytes:bytes.length, exportBytes:exported.bytes.length,
      inputSha256:await codec.sha256(bytes),
      components:codec.componentNames(reimported).length, simulations:reimported.parsed.simulations.length,
      entryHashes:reimported.entries.map(e=>({path:e.path,sha256:e.sha256}))};
  });
  const report = { fixture:process.env.ORK_PROOF_INPUT ? basename(source) : relative(fileURLToPath(repo),resolve(source)), runtime: await browser.version(), bundleBytes: bundle.outputFiles[0].contents.length, ...result };
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
