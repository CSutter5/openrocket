import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { java, run, output, repo } from './fixtures.mjs';
import { openProperties } from './workspace.mjs';
await mkdir(output, { recursive: true });
await run('javac', ['-cp', resolve(output,'classes') + delimiter + process.env.ORK_PROOF_CLASSPATH, '-d', resolve(output,'classes'), resolve(repo,'web/app/test/ComponentDesktopProof.java')], 'editor-javac');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const checks = [], errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{constructor(url,options){super(url,options);if(String(url).includes('document.worker')){window.documentWorker=this;this.addEventListener('message',({data})=>{if(data.result?.view){window.acceptedView=data.result.view;window.viewVersion=(window.viewVersion??0)+1;}});}}};});
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4173');await page.locator('.rocket-drawing polygon').first().waitFor();
  const tree=page.getByRole('navigation',{name:'Component tree'}), editor=page.getByRole('dialog',{name:'Component editor',exact:true});
  const sample=resolve(repo,'web/app/public/rocket-sample.ork'), rich=resolve(output,'explicit/G1-A.ork');
  async function load(path){const version=await page.evaluate(()=>window.viewVersion??0);await page.getByLabel('Open local .ork').setInputFiles(path);await page.waitForFunction(version=>window.viewVersion>version,version);await page.getByRole('status').filter({hasText:'Archive opened.'}).waitFor();}
  async function close(){if(await editor.count())await editor.press('Escape');}
  async function download(name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ork',exact:true}).click();const path=resolve(output,name);await(await event).saveAs(path);return path;}
  async function view(){return page.evaluate(()=>window.acceptedView);}
  async function select(id){await tree.locator(`[data-component-id="${id}"]`).click();}
  for(const kind of ['cg','cp']){const marker=page.getByTestId(`rocket-${kind}`);assert.equal(await marker.locator('text').count(),0);assert.match(await marker.getAttribute('transform'),/scale\(0\.75\)/);assert.ok(await marker.getAttribute('aria-label'));}
  checks.push('CG/CP symbols are smaller and contain no visible text labels; accessible names and numeric positions remain');

  // A new automatic BodyTube exposes its native fields immediately.
  await page.getByRole('region',{name:'Add new component'}).getByRole('button',{name:'Body tube',exact:true}).click();await page.getByRole('status').filter({hasText:'Component created.'}).waitFor();
  assert.ok(await editor.getByLabel('radius value',{exact:true}).isEnabled());assert.ok(await editor.getByLabel('length value',{exact:true}).isEnabled());
  await close();

  const standard=await importArchive(new Uint8Array(await readFile(sample)));
  const types=['stage','parallelstage','podset','nosecone','bodytube','transition','trapezoidfinset','ellipticalfinset','freeformfinset','tubefinset','railbutton','launchlug','innertube','tubecoupler','centeringring','bulkhead','engineblock','parachute','streamer','shockcord','masscomponent'];
  for(const type of types){
    const path=resolve(output,`created-${type}.ork`);await load(path);const current=await view(), added=current.components.find(c=>!standard.parsed.components.some(n=>n.id===c.id));await select(added.id);await openProperties(page);
    const imported=editor.locator('.imported-properties');if(!await imported.evaluate(n=>n.open))await imported.locator('summary').click();
    assert.equal(await imported.locator('.imported-property').count(),added.properties.length);
    for(const input of await imported.locator('input,select,textarea').all())assert.ok(await input.isEnabled(),`${type} field is editable`);
    await close();
  }
  checks.push('every displayed scalar and attribute on all 21 component types has an enabled editor; new automatic BodyTubes expose editable dimensions immediately');
  const initial=await importArchive(new Uint8Array(await readFile(sample)));
  const nose=initial.parsed.components.find(n=>n.name==='nosecone'), tube=initial.parsed.components.find(n=>n.name==='bodytube'), fins=initial.parsed.components.find(n=>n.name==='trapezoidfinset');
  const cases=[['nose-length',nose.id,'length','0.2',{}],['nose-shape',nose.id,'shape','conical',{}],['body-radius',tube.id,'radius','0.035',{}],['body-thickness',tube.id,'thickness','0.002',{}],['fin-height',fins.id,'height','0.08',{}],['fin-count',fins.id,'fincount','4',{}],['fin-position',fins.id,'axialoffset','-0.01',{method:'bottom'}],['fin-rotation',fins.id,'rotation','45',{}],['material-density',tube.id,'material','Fiberglass',{type:'bulk',density:'1900.0'}]];
  for(const [key,id,name,value,attributes] of cases){
    await load(sample);await select(id);await openProperties(page);
    const imported=editor.locator('.imported-properties');if(!await imported.evaluate(n=>n.open))await imported.locator('summary').click();
    const control=editor.getByLabel(`${name} value`,{exact:true});if(await control.evaluate(n=>n instanceof HTMLSelectElement))await control.selectOption(value);else await control.fill(value);
    for(const [attribute,text] of Object.entries(attributes)){const input=editor.getByLabel(`${name} ${attribute}`,{exact:true});if(await input.evaluate(n=>n instanceof HTMLSelectElement))await input.selectOption(text);else await input.fill(text);}
    await editor.getByRole('button',{name:`Apply ${name} value`,exact:true}).click();await page.getByRole('status').filter({hasText:'Component property updated.'}).waitFor();
    const path=await download(`edited-${key}.ork`);await java('ComponentDesktopProof',['property',sample,path,id,name,value,JSON.stringify(attributes),resolve(output,`native-edited-${key}`)],`native-edited-${key}`);
    if(key==='fin-rotation'){
      const current=await view(), ids=resolve(output,'rotated-drawing-ids.txt'), expectedPath=resolve(output,'rotated-drawing.json');
      await writeFile(ids,current.drawing.componentIndices.map(i=>current.components[i].id).join('\n'));
      await java('EditorDesktopProof',['drawing',path,ids,expectedPath],'rotated-drawing');const expected=JSON.parse(await readFile(expectedPath,'utf8'));
      assert.equal(current.drawing.polygons.length,expected.polygons.length);
      current.drawing.polygons.forEach((polygon,i)=>{assert.equal(polygon.points.length,expected.polygons[i].points.length);polygon.points.forEach((point,j)=>point.forEach((value,k)=>assert.ok(Math.abs(value-expected.polygons[i].points[j][k])<1e-10)));});
    }
    await close();await load(path);await select(id);await openProperties(page);
    const reopened=editor.locator('.imported-properties');if(!await reopened.evaluate(n=>n.open))await reopened.locator('summary').click();
    assert.equal(await editor.getByLabel(`${name} value`,{exact:true}).inputValue(),value);await close();
  }
  checks.push('raw name-independent fields, numeric geometry, enum, count/position aliases, angle and material density edit/reopen and match native setters/full serialization/save/reload');
  checks.push('edited nonzero fin rotation produces drawing vertices matching the loaded desktop geometry');

  const lugSource=resolve(output,'created-launchlug.ork'), lugArchive=await importArchive(new Uint8Array(await readFile(lugSource))), lug=lugArchive.parsed.components.find(n=>n.name==='launchlug');
  await load(lugSource);await select(lug.id);await openProperties(page);
  await editor.getByLabel('radialdirection value',{exact:true}).fill('30');await editor.getByRole('button',{name:'Apply radialdirection value',exact:true}).click();await page.getByRole('status').filter({hasText:'Component property updated.'}).waitFor();
  assert.equal(await editor.getByLabel('angleoffset value',{exact:true}).inputValue(),'30');
  const lugPath=await download('edited-lug-angle.ork');await java('ComponentDesktopProof',['property',lugSource,lugPath,lug.id,'radialdirection','30','{}',resolve(output,'native-lug-angle')],'native-lug-angle');await close();
  checks.push('launch-lug legacy radial direction keeps the current angle field synchronized and matches native serialization');

  const longText='Detailed note '+ 'x'.repeat(260)+' & <check>\nsecond line';
  const longSource=resolve(output,'long-comment.ork');
  await writeFile(longSource,(await readFile(sample,'utf8')).replace('<length>0.12</length>',`<comment>${longText.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</comment><length>0.12</length>`));
  await load(longSource);await select(nose.id);await openProperties(page);assert.equal(await editor.getByLabel('comment value',{exact:true}).inputValue(),longText);
  const changedText=longText+'\nAdditional detail';await editor.getByLabel('comment value',{exact:true}).fill(changedText);await editor.getByRole('button',{name:'Apply comment value',exact:true}).click();await page.getByRole('status').filter({hasText:'Component property updated.'}).waitFor();
  const comments=await download('edited-long-comment.ork');await java('ComponentDesktopProof',['property',longSource,comments,nose.id,'comment',changedText,'{}',resolve(output,'native-long-comment')],'native-long-comment');
  await close();await load(comments);await select(nose.id);await openProperties(page);assert.equal(await editor.getByLabel('comment value',{exact:true}).inputValue(),changedText);await close();
  checks.push('full untruncated multiline comments and XML-special characters edit/reopen and match native string setters');
  await load(sample);await select(tube.id);await openProperties(page);await editor.locator('.imported-properties summary').click();
  await editor.getByLabel('length value',{exact:true}).fill('NaN');await editor.getByRole('button',{name:'Apply length value',exact:true}).click();await page.getByRole('alert').filter({hasText:'finite decimal'}).waitFor();
  assert.deepEqual(await readFile(await download('invalid-raw-property.ork')),await readFile(sample));await close();
  checks.push('invalid numeric properties retain the accepted archive');

  for(const [name,operation,id] of [['sample-up','up',tube.id],['sample-down','down',nose.id],['sample-copy','duplicate',tube.id],['sample-delete','delete',tube.id],['rich-copy','duplicate',null],['rich-delete','delete',null]]){
    const source=name.startsWith('rich')?rich:sample;await load(source);const before=await view(), target=id??before.components.find(c=>c.type==='bodytube').id;
    await select(target);await page.getByRole('button',{name:{up:'Move up',down:'Move down',duplicate:'Duplicate',delete:'Delete'}[operation],exact:true}).click();await page.getByRole('status').filter({hasText:'Component tree updated.'}).waitFor();
    const after=await view(), selected=await tree.getByRole('button',{pressed:true}).getAttribute('data-component-id'), selectedNode=after.components.find(c=>c.id===selected);
    const path=await download(`${name}.ork`);await java('ComponentDesktopProof',['tree',source,path,target,operation,selectedNode?.id??'',resolve(output,`native-${name}`)],`native-${name}`);
    assert.deepEqual(after.simulations.map(s=>s.id),before.simulations.map(s=>s.id));
    const original=await importArchive(new Uint8Array(await readFile(source))), changed=await importArchive(new Uint8Array(await readFile(path)));
    for(const entry of original.entries.filter(e=>e.path!=='rocket.ork'))assert.equal(changed.entries.find(e=>e.path===entry.path)?.sha256,entry.sha256);
    for(const name of ['docprefs','poc:opaque']){const a=original.parsed.nodes.find(n=>n.name===name),b=changed.parsed.nodes.find(n=>n.name===name);if(a)assert.equal(changed.xml.slice(b.start,b.end),original.xml.slice(a.start,a.end));}
    original.parsed.simulations.forEach((sim,i)=>{const retained=changed.parsed.simulations[i];assert.equal(changed.xml.slice(retained.contentStart,retained.contentEnd),original.xml.slice(sim.contentStart,sim.contentEnd));});
  }
  checks.push('move up/down, deep duplicate with fresh IDs and delete with selection recovery; native design/reopen comparisons (deleted history normalization only), rich assets/series/simulation identities retained');
  const staged=resolve(output,'component-stages.ork');await java('ComponentDesktopProof',['generate-tree',rich,staged],'generate-component-stages');
  for(const operation of ['up','down','duplicate','delete']){
    await load(staged);const before=await view(), stages=before.components.filter(c=>c.type==='stage'), target=stages[operation==='down'?0:1].id;
    await select(target);await page.getByRole('button',{name:{up:'Move up',down:'Move down',duplicate:'Duplicate',delete:'Delete'}[operation],exact:true}).click();await page.getByRole('status').filter({hasText:'Component tree updated.'}).waitFor();
    const selected=await tree.getByRole('button',{pressed:true}).getAttribute('data-component-id');const path=await download(`stages-${operation}.ork`);
    await java('ComponentDesktopProof',['tree',staged,path,target,operation,selected,resolve(output,`native-stages-${operation}`)],`native-stages-${operation}`);
  }
  checks.push('stage move, duplicate and delete preserve configuration activeness by stage identity and match native design/reload (deleted history normalization only)');
  await load(resolve(output,'ring/G1-A.ork'));const ringView=await view(), ringBody=ringView.components.find(c=>c.type==='bodytube');await select(ringBody.id);await openProperties(page);
  await editor.locator('.imported-properties summary').click();await editor.getByLabel('radius value',{exact:true}).fill('0.005');
  const ringOriginal=await readFile(await download('raw-ring-before.ork'));await editor.getByRole('button',{name:'Apply radius value',exact:true}).click();await page.getByRole('alert').waitFor();
  assert.deepEqual(await readFile(await download('raw-ring-rejected.ork')),ringOriginal);await close();
  checks.push('raw radius controls retain the existing automatic-ring underfit refusal and accepted archive bytes');
  await load(sample);await tree.getByRole('button',{name:'Sustainer stage',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Delete',exact:true}).isDisabled());
  await tree.getByRole('button',{name:'Local demo rocket rocket',exact:true}).click();for(const name of ['Move up','Move down','Duplicate','Delete'])assert.ok(await page.getByRole('button',{name,exact:true}).isDisabled());
  const current=await view(), currentTube=current.components.find(c=>c.id===tube.id);
  async function workerRequest(action){return page.evaluate(action=>new Promise(resolve=>{const worker=window.documentWorker,id=900001;const listener=({data})=>{if(data.id===id){worker.removeEventListener('message',listener);resolve(data);}};worker.addEventListener('message',listener);worker.postMessage({id,action});}),action);}
  for(const action of [{type:'componentTree',expectedHash:'stale',id:tube.id,operation:'delete'},{type:'componentProperty',expectedHash:'stale',id:tube.id,key:currentTube.properties.find(p=>p.name==='length').key,value:'0.5',attributes:{}}])assert.match((await workerRequest(action)).error,/Document changed/);
  assert.match((await workerRequest({type:'componentTree',expectedHash:current.hash,id:current.components[0].id,operation:'delete'})).error,/unavailable/);
  assert.deepEqual(await readFile(await download('editor-stale-retained.ork')),await readFile(sample));
  const preserved=(await readFile(sample,'utf8')).replace('version="1.11"','version="9.99"');
  await page.getByLabel('Open local .ork').setInputFiles({name:'preserved-editor.ork',mimeType:'application/octet-stream',buffer:Buffer.from(preserved)});await page.getByText('preserved-editor.ork',{exact:true}).waitFor();await openProperties(page);
  for(const input of await editor.locator('.imported-properties input,.imported-properties select,.imported-properties textarea').all())assert.ok(await input.isDisabled());
  assert.equal(await readFile(await download('editor-preservation.ork'),'utf8'),preserved);await close();await load(sample);
  checks.push('stale property/tree requests, root deletion and preservation-only inputs cannot change the accepted archive');
  await select(nose.id);await openProperties(page);await page.screenshot({path:resolve(output,'editable-component-properties.png')});
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'component-editor-report.json'),JSON.stringify({outcome:'passed',checks,browser:browser.version(),pageErrors:errors},null,2)+'\n');console.log('Component editor and tree controls passed: '+checks.join('; '));
}finally{await browser.close();}
