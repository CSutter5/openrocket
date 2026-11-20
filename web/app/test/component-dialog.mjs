import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, delimiter } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { java, run, output, repo } from './fixtures.mjs';
import { openProperties } from './workspace.mjs';
await mkdir(output, { recursive: true });
await run('javac',['-cp',resolve(output,'classes')+delimiter+process.env.ORK_PROOF_CLASSPATH,'-d',resolve(output,'classes'),resolve(repo,'web/app/test/ComponentDesktopProof.java')],'dialog-javac');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const checks=[], errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{constructor(url,options){super(url,options);if(String(url).includes('document.worker')){window.documentWorker=this;this.addEventListener('message',({data})=>{if(data.result?.view){window.acceptedView=data.result.view;window.viewVersion=(window.viewVersion??0)+1;}});}}};});
  await page.goto(process.env.ORK_POC_URL||'http://127.0.0.1:4177');await page.locator('.rocket-drawing polygon').first().waitFor();
  const editor=page.getByRole('dialog',{name:'Component editor',exact:true}), tree=page.getByRole('navigation',{name:'Component tree'}), sample=resolve(repo,'web/app/public/rocket-sample.ork');
  const original=await importArchive(new Uint8Array(await readFile(sample))), node=type=>original.parsed.components.find(n=>n.name===type);
  async function load(path=sample){const version=await page.evaluate(()=>window.viewVersion??0);await page.getByLabel('Open local .ork').setInputFiles(path);await page.waitForFunction(v=>window.viewVersion>v,version);await page.getByRole('status').filter({hasText:'Archive opened.'}).waitFor();}
  async function open(type){await tree.locator(`[data-component-id="${node(type).id}"]`).click();await openProperties(page,{advanced:false});}
  async function tab(name){await editor.getByRole('tab',{name,exact:true}).click();}
  const input=label=>editor.getByRole('spinbutton',{name:label,exact:true});
  async function quantity(label,value,unit){await editor.getByLabel(`${label} unit`,{exact:true}).selectOption(unit);await input(label).fill(String(value));}
  async function save(){await editor.getByRole('button',{name:'OK',exact:true}).click();await editor.waitFor({state:'detached'});}
  async function download(name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ork',exact:true}).click();const path=resolve(output,name);await(await event).saveAs(path);return path;}
  async function native(source,path,type,changes,name){const json=resolve(output,`${name}-changes.json`);await writeFile(json,JSON.stringify(changes));await java('ComponentDesktopProof',['dialog',source,path,node(type).id,json,resolve(output,`native-${name}`)],`native-${name}`);}
  async function screenshot(name){await page.screenshot({path:resolve(output,name+'.png')});}

  await tree.locator(`[data-component-id="${node('bodytube').id}"]`).click();await page.getByRole('button',{name:'Edit component',exact:true}).click();
  assert.equal(await editor.getByRole('tab',{name:'General',exact:true}).getAttribute('aria-selected'),'true');
  assert.deepEqual(await editor.getByRole('tab').allTextContents(),['General','Motor','Override','Appearance','Comment','Advanced']);
  assert.equal(await editor.getByRole('button',{name:/Parts Library/i}).count(),0);
  await editor.getByLabel('Length unit',{exact:true}).selectOption('in');
  assert.ok(Math.abs(Number(await input('Length').inputValue())-.4/.0254)<1e-9);
  await editor.getByLabel('Outer diameter unit',{exact:true}).selectOption('mm');
  assert.equal(await editor.getByLabel('Length unit',{exact:true}).inputValue(),'in');
  await editor.getByLabel('Length unit',{exact:true}).selectOption('ft');
  await editor.getByLabel('Length unit',{exact:true}).selectOption('in');
  await editor.getByRole('slider',{name:'Length slider',exact:true}).focus();await page.keyboard.press('ArrowRight');
  assert.ok(Math.abs(Number(await input('Length').inputValue())-.402/.0254)<1e-9);
  await quantity('Length',400,'mm');await editor.getByLabel('Length unit',{exact:true}).selectOption('in');
  await save();assert.deepEqual(await readFile(await download('dialog-units-only.ork')),await readFile(sample));
  await open('bodytube');assert.equal(await editor.getByLabel('Length unit',{exact:true}).inputValue(),'in');
  await quantity('Length',30,'in');await quantity('Outer diameter',2.242,'in');await quantity('Wall thickness',.045,'in');
  await screenshot('native-body-tube');await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await readFile(await download('dialog-cancelled.ork')),await readFile(sample));
  checks.push('desktop body-tube tabs, independent unit choices, precision-preserving unit-only OK, session unit retention and Cancel retain exact archive bytes');

  await open('bodytube');await quantity('Length',2,'ft');await quantity('Outer diameter',2,'in');await quantity('Wall thickness',1,'mm');
  await editor.getByLabel('Length unit',{exact:true}).selectOption('in');assert.equal(Number(await input('Length').inputValue()),24);await editor.getByLabel('Length unit',{exact:true}).selectOption('ft');
  await editor.getByLabel('Inner diameter unit',{exact:true}).selectOption('mm');assert.ok(Math.abs(Number(await input('Inner diameter').inputValue())-48.8)<1e-9);
  await quantity('Inner diameter',1.92,'in');await save();
  const bodyPath=await download('dialog-body.ork'), body=await importArchive(new Uint8Array(await readFile(bodyPath))), bodyNode=body.parsed.components.find(n=>n.id===node('bodytube').id);
  assert.ok(Math.abs(Number(bodyNode.children.find(n=>n.name==='radius').text)-.0254)<1e-14);
  assert.ok(Math.abs(Number(bodyNode.children.find(n=>n.name==='thickness').text)-.001016)<1e-14);
  await native(sample,bodyPath,'bodytube',{changes:[{name:'length',value:'2',lengthUnit:'ft'},{name:'radius',value:'2',lengthUnit:'in',diameter:true},{name:'thickness',value:'1.92',lengthUnit:'in',diameter:true,method:'innerRadius'}]},'dialog-body');
  checks.push('mixed ft/in/mm body dimensions and the derived inner-diameter/wall relationship serialize in SI and match actual native setters/reload');

  await load();await open('nosecone');assert.ok(await editor.getByRole('tab',{name:'Shoulder',exact:true}).isVisible());
  await editor.getByLabel('Nose cone shape',{exact:true}).selectOption('power');await input('Shape parameter').fill('.5');
  await quantity('Length',1.8,'in');await quantity('Base diameter',.618,'in');await quantity('Wall thickness',.05,'in');
  await screenshot('native-nose-cone');
  await tab('Shoulder');await quantity('Shoulder diameter',.5,'in');await quantity('Shoulder length',.25,'in');await quantity('Shoulder thickness',.5,'mm');await editor.getByLabel('Capped',{exact:true}).check();
  await tab('Comment');await editor.getByLabel('Component comment',{exact:true}).fill('Power nose & shoulder <checked>');await save();
  const nosePath=await download('dialog-nose.ork');
  await native(sample,nosePath,'nosecone',{changes:[{name:'shape',value:'power'},{name:'shapeparameter',value:'.5'},{name:'length',value:'1.8',lengthUnit:'in'},{name:'aftradius',value:'.618',lengthUnit:'in',diameter:true},{name:'thickness',value:'.05',lengthUnit:'in'},{name:'aftshoulderradius',value:'.5',lengthUnit:'in',diameter:true},{name:'aftshoulderlength',value:'.25',lengthUnit:'in'},{name:'aftshoulderthickness',value:'.5',lengthUnit:'mm'},{name:'aftshouldercapped',value:'true'},{name:'comment',value:'Power nose & shoulder <checked>'}]},'dialog-nose');
  checks.push('native nose/shoulder/comment tabs, shape choice, diameter conversion, added shoulder fields and escaped comments match full native serialization/reload');

  await load();await open('trapezoidfinset');assert.ok(await editor.getByRole('tab',{name:'Fin tabs',exact:true}).isVisible());
  await input('Number of fins').fill('4');await quantity('Fin cant',2,'deg');await quantity('Root chord',5,'in');await quantity('Tip chord',1,'in');await quantity('Height',2.35,'in');await quantity('Sweep length',4.5,'in');
  assert.ok(Math.abs(Number(await input('Sweep angle').inputValue())-Math.atan2(4.5,2.35)*180/Math.PI)<1e-9);
  await editor.getByLabel('Fin cross section',{exact:true}).selectOption('airfoil');await quantity('Thickness',.2,'in');
  await editor.getByLabel('Position relative to',{exact:true}).selectOption('bottom');await quantity('Position offset',-1,'in');await quantity('Fin rotation',Math.PI/4,'rad');await quantity('Fillet radius',.4,'in');
  await screenshot('native-fin-set');
  await tab('Fin tabs');await quantity('Tab length',2,'in');await quantity('Tab height',3,'mm');await quantity('Tab position',.2,'in');
  await save();const finPath=await download('dialog-fins.ork');
  await native(sample,finPath,'trapezoidfinset',{changes:[{name:'fincount',value:'4'},{name:'cant',value:'2'},{name:'rootchord',value:'5',lengthUnit:'in'},{name:'tipchord',value:'1',lengthUnit:'in'},{name:'height',value:'2.35',lengthUnit:'in'},{name:'sweeplength',value:'4.5',lengthUnit:'in'},{name:'crosssection',value:'airfoil'},{name:'thickness',value:'.2',lengthUnit:'in'},{name:'axialoffset',value:'-1',lengthUnit:'in',attributes:{method:'bottom'}},{name:'rotation',value:'45'},{name:'filletradius',value:'.4',lengthUnit:'in'},{name:'tablength',value:'2',lengthUnit:'in'},{name:'tabheight',value:'3',lengthUnit:'mm'},{name:'tabposition',value:'.2',lengthUnit:'in',attributes:{relativeto:'middle'}}]},'dialog-fins');
  await load(finPath);await open('trapezoidfinset');await quantity('Sweep angle',45,'deg');await save();
  const sweepPath=await download('dialog-sweep.ork');await native(finPath,sweepPath,'trapezoidfinset',{changes:[{name:'sweeplength',value:String(Math.PI/4),method:'sweepAngle'}]},'dialog-sweep');
  checks.push('fin layout, counts/cant/chords/sweep/section/placement/rotation/fillets/tabs and both directions of sweep-angle conversion match native setters/reload with mixed angle and length units');

  const nativeTabs=await importArchive(new Uint8Array(await readFile(resolve(output,'native-dialog-fins/desktop-resaved.ork'))));
  const legacyXml=nativeTabs.xml.replace('<tabposition relativeto="center">','<tabposition relativeto="center" data-retain="opaque">');
  const legacySource=resolve(output,'dialog-legacy-tabs.ork');await writeFile(legacySource,legacyXml);await load(legacySource);await open('trapezoidfinset');await tab('Fin tabs');
  await editor.getByLabel('Tab position relative to',{exact:true}).selectOption('bottom');await quantity('Tab position',1,'cm');await save();
  const legacyPath=await download('dialog-legacy-tabs-edited.ork'), legacyAfter=await importArchive(new Uint8Array(await readFile(legacyPath)));
  const tabFields=legacyAfter.parsed.components.find(n=>n.id===node('trapezoidfinset').id).children.filter(n=>n.name==='tabposition');
  assert.equal(tabFields.length,2);assert.equal(tabFields[0].attributes['data-retain']?.value,'opaque');assert.deepEqual(tabFields.map(n=>n.attributes.relativeto.value),['end','bottom']);assert.ok(tabFields.every(n=>Number(n.text)===.01));
  await native(legacySource,legacyPath,'trapezoidfinset',{changes:[{name:'tabposition',value:'.01',attributes:{relativeto:'bottom'}}]},'dialog-legacy-tabs');
  checks.push('editing native legacy/current fin-tab fields keeps methods/values synchronized and preserves unknown attributes');

  await load();await open('bodytube');await tab('Override');await editor.getByLabel('Override mass',{exact:true}).check();await quantity('Mass',1.5,'oz');
  await editor.getByLabel('Override center of gravity',{exact:true}).check();await quantity('Center of gravity',10,'in');await save();
  const overridePath=await download('dialog-overrides.ork');await native(sample,overridePath,'bodytube',{changes:[{name:'overridemass',value:String(1.5*.028349523125)},{name:'overridecg',value:'.254'}]},'dialog-overrides');
  await load(overridePath);await open('bodytube');await tab('Override');await editor.getByLabel('Override mass',{exact:true}).uncheck();await save();
  const removed=await download('dialog-remove-override.ork');await native(overridePath,removed,'bodytube',{changes:[{name:'overridemass',remove:true}]},'dialog-remove-override');
  checks.push('mass/CG overrides have independent oz/in controls, add native override fields and disable cleanly through native-equivalent removal');

  await load(overridePath);await open('bodytube');await tab('Override');await editor.getByLabel('Override all subcomponents',{exact:true}).first().check();await save();
  const withFlags=await download('dialog-override-flags.ork');await load(withFlags);await open('bodytube');await tab('Override');
  await editor.getByLabel('Override mass',{exact:true}).uncheck();await editor.getByLabel('Override mass',{exact:true}).check();
  assert.ok(await editor.getByLabel('Override all subcomponents',{exact:true}).first().isChecked());await save();assert.deepEqual(await readFile(await download('dialog-override-flag-noop.ork')),await readFile(withFlags));
  await open('bodytube');await tab('Override');await editor.getByLabel('Override mass',{exact:true}).uncheck();await save();
  const flagsRemoved=await download('dialog-override-flags-removed.ork');await native(withFlags,flagsRemoved,'bodytube',{changes:[{name:'overridemass',remove:true}]},'dialog-override-flags-removed');
  checks.push('toggling an override off and back on retains its subcomponent flags and exact unchanged bytes');

  await load();await open('bodytube');await editor.locator('.material-properties summary').click();
  await quantity('Material density',1.85,'g/cm3');await quantity('Length',25,'cm');await save();
  const materialPath=await download('dialog-density.ork');await native(sample,materialPath,'bodytube',{changes:[{name:'material',value:'Fiberglass',attributes:{type:'bulk',density:'1850'}},{name:'length',value:'.25'}]},'dialog-density');
  await load();await open('bodytube');await editor.getByLabel('Component material',{exact:true}).selectOption({label:'Aluminum'});await save();
  const aluminum=await download('dialog-aluminum.ork');await native(sample,aluminum,'bodytube',{changes:[{name:'material',value:'Aluminum',attributes:{type:'bulk',density:'2700'}}]},'dialog-aluminum');
  checks.push('native material dropdown and independently converted density edit the archived material and match full desktop serialization');

  await load();await open('bodytube');await editor.getByLabel('Component name',{exact:true}).fill('Rejected batch');await quantity('Length',1,'ft');await input('Wall thickness').fill('');
  await editor.getByRole('button',{name:'OK',exact:true}).click();await page.getByRole('alert').filter({hasText:'finite decimal'}).waitFor();
  assert.deepEqual(await readFile(await download('dialog-invalid.ork')),await readFile(sample));await editor.press('Escape');
  const current=await page.evaluate(()=>window.acceptedView);
  const stale=await page.evaluate(action=>new Promise(resolve=>{const worker=window.documentWorker,id=930001;const receive=({data})=>{if(data.id===id){worker.removeEventListener('message',receive);resolve(data);}};worker.addEventListener('message',receive);worker.postMessage({id,action});}),{type:'componentProperties',expectedHash:'stale',id:node('bodytube').id,name:'Stale',changes:[]});assert.match(stale.error,/Document changed/);
  assert.equal((await page.evaluate(()=>window.acceptedView)).hash,current.hash);
  checks.push('invalid multi-field OK and stale dialog commands retain the entire accepted archive, including name and earlier valid draft fields');

  const richSource=resolve(output,'explicit/G1-A.ork');await load(richSource);
  const richView=await page.evaluate(()=>window.acceptedView), richTube=richView.components.find(c=>c.type==='bodytube');
  await tree.locator(`[data-component-id="${richTube.id}"]`).click();await openProperties(page,{advanced:false});await quantity('Length',.5,'m');await quantity('Wall thickness',1,'mm');await save();
  const richPath=await download('dialog-rich.ork'), richBefore=await importArchive(new Uint8Array(await readFile(richSource))), richAfter=await importArchive(new Uint8Array(await readFile(richPath)));
  assert.deepEqual((await page.evaluate(()=>window.acceptedView)).simulations.map(s=>s.id),richView.simulations.map(s=>s.id));
  for(const entry of richBefore.entries.filter(e=>e.path!=='rocket.ork'))assert.equal(richAfter.entries.find(e=>e.path===entry.path)?.sha256,entry.sha256);
  richBefore.parsed.simulations.forEach((sim,i)=>{const after=richAfter.parsed.simulations[i];assert.equal(richAfter.xml.slice(after.contentStart,after.contentEnd),richBefore.xml.slice(sim.contentStart,sim.contentEnd));if(['loaded','uptodate','external'].includes(sim.attributes.status?.value))assert.equal(after.attributes.status.value,'outdated');});
  for(const name of ['docprefs','poc:opaque']){const before=richBefore.parsed.nodes.find(n=>n.name===name), after=richAfter.parsed.nodes.find(n=>n.name===name);if(before)assert.equal(richAfter.xml.slice(after.start,after.end),richBefore.xml.slice(before.start,before.end));}
  checks.push('multi-field dialog saves retain rich attachment hashes, simulation identities/settings/series, explicit preferences and opaque XML while invalidating current results');

  const incomplete=(await readFile(sample,'utf8')).replace('<material type="bulk" density="1850.0">Fiberglass</material><subcomponents>','<material type="bulk">Fiberglass</material><subcomponents>').replace('<radius>0.0284734</radius>','<color red="120"></color><radius>0.0284734</radius>');
  const incompletePath=resolve(output,'dialog-incomplete-values.ork');await writeFile(incompletePath,incomplete);await load(incompletePath);await open('bodytube');await editor.locator('.material-properties summary').click();await tab('Appearance');
  assert.ok(await input('Red').isVisible());await editor.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await readFile(await download('dialog-incomplete-retained.ork')),await readFile(incompletePath));
  checks.push('incomplete imported material/color attributes remain inspectable without inventing missing fields or changing bytes');

  await load();await open('bodytube');await page.setViewportSize({width:390,height:844});
  assert.ok(await editor.evaluate(n=>{const b=n.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.bottom<=innerHeight;}));
  assert.ok(await editor.locator('.native-tab-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await screenshot('native-component-mobile');
  await quantity('Length',12,'in');await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await readFile(await download('dialog-mobile-cancel.ork')),await readFile(sample));
  await page.setViewportSize({width:844,height:390});await open('trapezoidfinset');
  await input('Thickness').scrollIntoViewIfNeeded();
  assert.ok(await editor.getByRole('button',{name:'OK',exact:true}).evaluate(n=>{const b=n.getBoundingClientRect();return b.y>=0&&b.bottom<=innerHeight;}));
  assert.ok(await editor.locator('.native-tab-content').evaluate(n=>n.scrollHeight>n.clientHeight&&n.scrollWidth<=n.clientWidth+1));
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();await page.setViewportSize({width:390,height:844});
  const preserved=(await readFile(sample,'utf8')).replace('version="1.11"','version="99.0"');
  await page.getByLabel('Open local .ork').setInputFiles({name:'dialog-preserved.ork',mimeType:'application/octet-stream',buffer:Buffer.from(preserved)});await page.getByText('dialog-preserved.ork',{exact:true}).waitFor();await open('bodytube');
  for(const control of await editor.locator('input,select').all())assert.ok(await control.isDisabled());assert.ok(await editor.getByRole('button',{name:'OK',exact:true}).isDisabled());
  await editor.press('Escape');assert.equal(await readFile(await download('dialog-preserved.ork'),'utf8'),preserved);
  checks.push('responsive phone layout, reachable fields and Cancel, and disabled preservation-only inputs/units preserve original bytes');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'component-dialog-report.json'),JSON.stringify({outcome:'passed',browser:browser.version(),checks,pageErrors:errors},null,2)+'\n');console.log('Desktop component dialogs passed: '+checks.join('; '));
} finally { await browser.close(); }
