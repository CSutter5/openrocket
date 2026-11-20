import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { repo, output, java, run } from './fixtures.mjs';
import { openSample } from './workspace.mjs';

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
await mkdir(output, { recursive: true });
await run('javac', ['-cp', resolve(output, 'classes') + ':' + process.env.ORK_PROOF_CLASSPATH, '-d', resolve(output, 'classes'), resolve(repo, 'web/app/test/ComponentDesktopProof.java'), resolve(repo, 'web/engine-adapter/src/main/java/proof/EditorStability.java'), resolve(repo, 'web/engine-adapter/src/main/java/proof/ImportedRocketFlight.java')], 'components-javac');
const checks = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Native = Worker;
    window.Worker = class extends Native {
      constructor(url, options) {
        super(url, options);
        if (String(url).includes('document.worker')) {
          window.documentWorker = this;
          this.addEventListener('message', ({data}) => { if (data.result?.view) window.acceptedView = data.result.view; });
        }
      }
    };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4173');
  await page.locator('.rocket-drawing polygon').first().waitFor();
  const tree = page.getByRole('navigation', { name: 'Component tree' });
  const palette = page.getByRole('region', { name: 'Add new component' });
  async function load(path) {
    await page.getByLabel('Open local .ork').setInputFiles(path);
    await page.getByRole('status').filter({ hasText: 'Archive opened.' }).waitFor();
    await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();
  }
  async function download(name) {
    const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
    const path = resolve(output, name);await (await event).saveAs(path);return path;
  }
  async function rejected(action, text) {
    const reply = await page.evaluate(action => new Promise(resolve => {
      const worker = window.documentWorker, id = 100000 + Math.floor(Math.random() * 100000);
      const listener = ({data}) => { if (data.id === id) { worker.removeEventListener('message', listener);resolve(data); } };
      worker.addEventListener('message', listener);worker.postMessage({id,action});
    }), action);
    assert.ok(reply.error?.includes(text), JSON.stringify(reply));
  }
  async function closeEditor() { const editor = page.getByRole('dialog', { name: 'Component editor', exact: true });if (await editor.count()) await editor.press('Escape'); }
  const sample = resolve(repo, 'web/app/public/rocket-sample.ork');
  const types = [['Stage','stage'],['Boosters','parallelstage'],['Pods','podset'],['Nose cone','nosecone'],['Body tube','bodytube'],['Transition','transition'],['Trapezoidal','trapezoidfinset'],['Elliptical','ellipticalfinset'],['Freeform','freeformfinset'],['Tube fins','tubefinset'],['Rail button','railbutton'],['Launch lug','launchlug'],['Inner tube','innertube'],['Tube coupler','tubecoupler'],['Centering ring','centeringring'],['Bulkhead','bulkhead'],['Engine block','engineblock'],['Parachute','parachute'],['Streamer','streamer'],['Shock cord','shockcord'],['Mass component','masscomponent']];
  const before = await importArchive(new Uint8Array(await readFile(sample)));
  for (const [label, type] of types) {
    await load(sample);
    await palette.getByRole('button', { name: label, exact: true }).click();
    const insert = page.getByRole('dialog', { name: 'Insert component', exact: true });
    if (await insert.count()) await insert.getByRole('button', { name: 'Add to the end', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Component created.' }).waitFor();
    assert.ok(await page.getByRole('dialog', { name: 'Component editor', exact: true }).isVisible());
    const path = await download(`created-${type}.ork`), after = await importArchive(new Uint8Array(await readFile(path)));
    assert.equal(after.parsed.components.length,before.parsed.components.length+1);
    const added = after.parsed.components.find(n => !before.parsed.components.some(c => c.id === n.id));assert.equal(added.name,type);
    const parent = added.parent.parent, siblings = parent.children.find(n => n.name === 'subcomponents').children;
    await java('ComponentDesktopProof', ['create',sample,path,added.id,parent.id,String(siblings.indexOf(added)),resolve(output,`native-created-${type}`)], `native-created-${type}`);
    if (!['stage','parallelstage','podset','freeformfinset'].includes(type)) {
      const stabilityReport = resolve(output, `stability-created-${type}.json`);
      await java('ComponentDesktopProof',['stability',path,'default',stabilityReport],`stability-created-${type}`);
      const native = JSON.parse(await readFile(stabilityReport,'utf8'));
      for (const name of ['cg','cp']) assert.ok(Math.abs(Number(await page.getByTestId(`rocket-${name}`).getAttribute('data-position'))-native[name])<1e-10, `${type} ${name} matches native`);
    }
    assert.equal(await tree.getByRole('button', { pressed: true }).getAttribute('aria-label'), `${added.label} ${type}`);
    await closeEditor();
  }
  checks.push('all 21 palette types create, select, open editor, download and match full native creation/save/reload; all 17 supported single-stage types retain native CG/CP');
  await load(sample);await tree.getByRole('button', { name: 'Local demo rocket rocket', exact: true }).click();
  assert.ok(await palette.getByRole('button', { name: 'Body tube', exact: true }).isDisabled());
  assert.ok(await palette.getByRole('button', { name: 'Parachute', exact: true }).isDisabled());
  await tree.getByRole('button', { name: 'Nose cone nosecone', exact: true }).click();
  await palette.getByRole('button', { name: 'Body tube', exact: true }).click();
  await page.getByRole('dialog', { name: 'Insert component', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await readFile(await download('creation-cancel.ork')),await readFile(sample));
  await palette.getByRole('button', { name: 'Body tube', exact: true }).click();
  await tree.getByRole('button', { name: 'Body tube bodytube', exact: true }).click();
  await page.getByRole('dialog', { name: 'Insert component', exact: true }).getByRole('button', { name: 'Insert after selected component', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Component created.' }).waitFor();
  const insertedPath = await download('creation-inserted.ork'), inserted = await importArchive(new Uint8Array(await readFile(insertedPath)));
  const insertedNode = inserted.parsed.components.find(n => !before.parsed.components.some(c => c.id === n.id));
  await java('ComponentDesktopProof',['create',sample,insertedPath,insertedNode.id,insertedNode.parent.parent.id,'1',resolve(output,'native-inserted')],'native-inserted');
  await closeEditor();checks.push('parent compatibility, insertion cancellation leaves exact bytes, insert after selected matches native');

  const rich = resolve(output,'explicit/G1-A.ork');
  const richBefore = await importArchive(new Uint8Array(await readFile(rich)));
  for (const [label,type] of [['Stage','stage'],['Boosters','parallelstage'],['Parachute','parachute']]) {
    await load(rich);
    const previousView = await page.evaluate(() => window.acceptedView);
    await palette.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('status').filter({hasText:'Component created.'}).waitFor();
    const currentView = await page.evaluate(() => window.acceptedView);
    assert.deepEqual(currentView.simulations.map(s=>s.id),previousView.simulations.map(s=>s.id));
    const path = await download(`rich-created-${type}.ork`), after = await importArchive(new Uint8Array(await readFile(path)));
    const added = after.parsed.components.find(n=>!richBefore.parsed.components.some(c=>c.id===n.id));
    const parent = added.parent.parent, siblings = parent.children.find(n=>n.name==='subcomponents').children;
    await java('ComponentDesktopProof',['create',rich,path,added.id,parent.id,String(siblings.indexOf(added)),resolve(output,`native-rich-${type}`)],`native-rich-${type}`);
    for (const entry of richBefore.entries.filter(e=>e.path!=='rocket.ork')) assert.equal(after.entries.find(e=>e.path===entry.path)?.sha256,entry.sha256);
    richBefore.parsed.simulations.forEach((simulation,index)=>{
      const retained=after.parsed.simulations[index];
      assert.equal(after.xml.slice(retained.contentStart,retained.contentEnd),richBefore.xml.slice(simulation.contentStart,simulation.contentEnd));
      assert.equal(retained.attributes.status.value,'outdated');
    });
    const opaqueBefore=richBefore.parsed.nodes.find(n=>n.name==='poc:opaque'),opaqueAfter=after.parsed.nodes.find(n=>n.name==='poc:opaque');
    assert.equal(after.xml.slice(opaqueAfter.start,opaqueAfter.end),richBefore.xml.slice(opaqueBefore.start,opaqueBefore.end));
    await rejected({type:'addComponent',expectedHash:previousView.hash,selectedId:previousView.components[0].id,componentType:'stage',position:'end'},'Document changed');
    const currentBytes=await readFile(path);assert.deepEqual(await readFile(await download(`rich-retained-${type}.ork`)),currentBytes);
    await closeEditor();
  }
  checks.push('native stage/booster/recovery creation preserves rich attachments, opaque XML, simulation identities/settings/series, invalidates stored results and rejects stale requests');
  await load(sample);
  const initialView = await page.evaluate(()=>window.acceptedView);
  await rejected({type:'addComponent',expectedHash:initialView.hash,selectedId:initialView.components[0].id,componentType:'parachute',position:'end'},'compatible parent');
  assert.deepEqual(await readFile(await download('creation-invalid-parent.ork')),await readFile(sample));
  await tree.getByRole('button',{name:'Nose cone nosecone',exact:true}).click();
  await palette.getByRole('button',{name:'Body tube',exact:true}).click();
  const explicit = resolve(repo,'web/app/public/explicit-tube.ork');await load(explicit);
  await page.getByRole('dialog',{name:'Insert component',exact:true}).getByRole('button',{name:'Insert after selected component',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Document changed'}).waitFor();
  assert.deepEqual(await readFile(await download('creation-replacement-retained.ork')),await readFile(explicit));
  await page.getByRole('dialog',{name:'Insert component',exact:true}).press('Escape');
  assert.equal(await page.getByTestId('rocket-cp').count(),0,'body tube alone has no defined CP');
  assert.equal(await page.getByTestId('rocket-cg').count(),1);
  const readOnly=(await readFile(sample,'utf8')).replace('version="1.11"','version="9.99"');
  await page.getByLabel('Open local .ork').setInputFiles({name:'read-only-creation.ork',mimeType:'application/octet-stream',buffer:Buffer.from(readOnly)});
  await page.getByText('read-only-creation.ork',{exact:true}).waitFor();
  for (const button of await palette.getByRole('button').all()) assert.ok(await button.isDisabled());
  const preserved=await page.evaluate(()=>window.acceptedView);
  await rejected({type:'addComponent',expectedHash:preserved.hash,selectedId:preserved.components[0].id,componentType:'stage',position:'end'},'read-only');
  assert.equal((await readFile(await download('creation-preservation.ork'),'utf8')),readOnly);
  checks.push('invalid parent and preservation-only requests retain exact bytes; pending insertion survives selection changes and refuses file replacement; zero-force CP stays undefined');

  await page.locator('.file-menu summary').click();await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByText('Untitled.ork', { exact: true }).waitFor();
  assert.equal(await tree.getByRole('button').count(),2);
  await palette.getByRole('button', { name: 'Nose cone', exact: true }).click();await page.getByRole('status').filter({ hasText: 'Component created.' }).waitFor();await closeEditor();
  await palette.getByRole('button', { name: 'Body tube', exact: true }).click();await page.getByRole('status').filter({ hasText: 'Component created.' }).waitFor();await closeEditor();
  const built = await download('created-new-rocket.ork');await load(built);assert.equal(await tree.getByRole('button').count(),4);
  checks.push('File New builds and reopens a new rocket');

  const saved = resolve(output,'saved-conditions.ork');await load(saved);
  const configs = await page.getByLabel('Flight configuration', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => n.value));
  for (const config of configs.slice(0,2)) {
    await page.getByLabel('Flight configuration', { exact: true }).selectOption(config);
    await page.getByRole('status').filter({ hasText: 'Session flight configuration selected.' }).waitFor();
    const report = resolve(output,`stability-${config}.json`);await java('ComponentDesktopProof',['stability',saved,config,report],`stability-${config}`);
    const native = JSON.parse(await readFile(report,'utf8'));
    for (const name of ['cg','cp']) assert.ok(Math.abs(Number(await page.getByTestId(`rocket-${name}`).getAttribute('data-position'))-native[name])<1e-10, `${name} native position`);
  }
  checks.push('launch CG including motors and worst-angle CP at Mach 0.3 match the loaded native document for two configurations');
  await page.getByRole('tab', { name: 'Flight simulations', exact: true }).click();
  const selector = page.getByLabel('Simulation units', { exact: true });
  const known = await importArchive(new Uint8Array(await readFile(saved)));
  const altitude = Number(known.parsed.nodes.find(n => n.name === 'flightdata').attributes.maxaltitude.value);
  for (const [unit, factor] of [['mm',.001],['cm',.01],['m',1],['km',1000],['in',.0254],['ft',.3048],['yd',.9144],['mi',1609.344]]) {
    await selector.selectOption(unit);const row = page.locator('.simulation-table tbody tr').first();
    assert.ok(Math.abs(Number(await row.locator('td').nth(3).textContent())-altitude/factor)<=Math.max(unit === 'km' || unit === 'mi' ? .00000051 : .0051,Math.abs(altitude/factor)*5e-6));
    await page.getByRole('button', { name: 'Plot', exact: true }).click();
    const graph = page.locator('.flight-graph');assert.ok(await graph.getByRole('img', { name: `Altitude versus time, ${unit}, seconds`, exact: true }).isVisible());
    assert.equal(await graph.getByLabel('Graph altitude units', { exact: true }).inputValue(),unit);await graph.press('Escape');
  }
  assert.deepEqual(await readFile(await download('simulation-unit-only.ork')),await readFile(saved));
  checks.push('all eight simulation/graph units use independent SI conversion factors and preserve exact archive bytes');
  await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();await page.screenshot({ path: resolve(output,'components-stability.png') });
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'components-report.json'),JSON.stringify({ outcome:'passed',checks,browser:browser.version(),pageErrors:errors },null,2)+'\n');
  console.log('Component creation, stability and expanded units passed: '+checks.join('; '));
} finally { await browser.close(); }
