import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {importArchive} from '../../packages/ork-format/src/index.js';
import {tubePropertyInput} from '../../packages/ork-format/src/tube-properties.js';
import {java,output,repo} from './fixtures.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const report={outcome:'running',browser:browser.version(),checks:[],desktop:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ORK_POC_URL||'http://127.0.0.1:5173');await page.getByRole('heading',{name:'Body tube',exact:true}).waitFor();
 const selector=page.getByLabel('Length units',{exact:true});
 const field=(name,unit)=>page.getByLabel(`${name} (${unit})`,{exact:true});
 const radius=unit=>field('BodyTube outer radius',unit),length=unit=>field('BodyTube length',unit),wall=unit=>field('Wall thickness',unit);
 async function download(name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ork',exact:true}).click();const file=await event;assert.equal(await file.failure(),null);const path=resolve(output,name);await file.saveAs(path);return path;}
 const sample=resolve(repo,'web/app/public/rocket-sample.ork');
 await page.getByLabel('Component name',{exact:true}).fill('Unsubmitted name');
 await radius('m').fill('.04');await length('m').fill('.5');await wall('m').fill('.002');
 await selector.selectOption('in');
 assert.ok(Math.abs(Number(await radius('in').inputValue())-.04/.0254)<1e-14);
 assert.ok(Math.abs(Number(await length('in').inputValue())-.5/.0254)<1e-14);
 assert.ok(Math.abs(Number(await wall('in').inputValue())-.002/.0254)<1e-14);
 await selector.selectOption('m');assert.equal(await radius('m').inputValue(),'.04');assert.equal(await length('m').inputValue(),'.5');assert.equal(await wall('m').inputValue(),'.002');
 assert.equal(await page.getByLabel('Component name',{exact:true}).inputValue(),'Unsubmitted name');
 assert.deepEqual(await readFile(await download('units-drafts.ork')),await readFile(sample));report.checks.push('physical and name drafts survive switches; document unchanged');
 const rich=resolve(output,'explicit/G1-A.ork');await page.getByLabel('Open local .ork').setInputFiles(rich);await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
 const accepted=await importArchive(new Uint8Array(await readFile(rich))),id=accepted.parsed.components.find(c=>c.name==='bodytube').id,input=tubePropertyInput(accepted,id);
 const points=await page.getByRole('region',{name:'Rocket drawing'}).locator('polygon').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')));
 const mass=await page.getByTestId('mass').textContent();
 for(let i=0;i<15;i++){await selector.selectOption('in');await selector.selectOption('m');}
 assert.equal(Number(await radius('m').inputValue()),input.radius);assert.equal(Number(await length('m').inputValue()),input.length);assert.equal(Number(await wall('m').inputValue()),input.thickness);
 await selector.selectOption('in');
 for(const button of ['Apply radius','Apply length','Apply wall thickness']){await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('status').filter({hasText:'No change'}).waitFor();}
 assert.deepEqual(await readFile(await download('units-noops.ork')),await readFile(rich));
 assert.deepEqual(await page.getByRole('region',{name:'Rocket drawing'}).locator('polygon').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points'))),points);
 assert.equal(await page.getByTestId('mass').textContent(),mass);assert.ok(Math.abs(Number(await page.getByTestId('cg').textContent())-input.length/2/.0254)<1e-13);
 await page.getByText('Selected tube measurements and local schematic',{exact:true}).click();await page.getByRole('img',{name:/outer radius .* in/}).waitFor();
 report.checks.push('30 switches and untouched inch submissions preserve exact archive/preset/results; drawing geometry and kg mass unchanged; CG/schematic converted');
 await radius('in').fill('NaN');await page.getByRole('button',{name:'Apply radius',exact:true}).click();await page.getByRole('alert').filter({hasText:'finite outer radius'}).waitFor();
 await selector.selectOption('m');assert.equal(await radius('m').inputValue(),'NaN');await page.getByRole('alert').filter({hasText:'1 m.'}).waitFor();
 assert.deepEqual(await readFile(await download('units-invalid.ork')),await readFile(rich));report.checks.push('invalid draft survives switch; validation uses current units and accepted archive retained');
 await selector.selectOption('in');await page.getByRole('button',{name:'Open rocket sample',exact:true}).click();await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
 let current=sample;const sampleId='20000003-0000-4000-8000-000000000000';
 for(const [property,label,value,metres] of [['length','BodyTube length','20','.508'],['radius','BodyTube outer radius','2','.0508'],['thickness','Wall thickness','.05','.00127']]){
  await field(label,'in').fill(value);await page.getByRole('button',{name:property==='thickness'?'Apply wall thickness':`Apply ${property}`,exact:true}).click();
  await page.getByRole('status').filter({hasText:'Java'}).waitFor();const edited=await download(`units-${property}.ork`);
  const directory=resolve(output,`desktop-units-${property}`);await mkdir(directory,{recursive:true});const path=resolve(directory,'report.json');
  await java(property==='radius'?'RadiusDesktopProof':'EditorDesktopProof',property==='radius'?[current,edited,sampleId,metres,path]:['property',current,edited,sampleId,property,metres,path],`units-${property}`);
  const desktop=JSON.parse(await readFile(path,'utf8'));assert.equal(desktop.outcome,'passed');assert.equal(Number(await page.getByTestId('mass').textContent()),desktop.after.mass);
  report.desktop.push({property,inches:value,metres:Number(metres),outcome:desktop.outcome});current=edited;
 }
 const final=await importArchive(new Uint8Array(await readFile(current))),finalInput=tubePropertyInput(final,sampleId);
 assert.equal(finalInput.length,.508);assert.equal(finalInput.radius,.0508);assert.equal(finalInput.thickness,.00127);
 await page.getByLabel('Open local .ork').setInputFiles(current);await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
 assert.ok(Math.abs(Number(await length('in').inputValue())-20)<1e-13);await selector.selectOption('m');assert.equal(await length('m').inputValue(),'0.508');
 await selector.selectOption('in');await page.screenshot({path:resolve(output,'inches-editor.png'),fullPage:true});assert.deepEqual(errors,[]);
 report.checks.push('20 in length, 2 in radius and .05 in wall exported in SI, reimported and matched pinned desktop setters/save/reload');report.outcome='passed';
 console.log('Meter/inch UI checks passed: draft preservation, exact unit-only/no-op exports, validation, display labels and SI desktop round trips.');
}catch(error){report.outcome='failed';report.error=String(error);throw error;}
finally{await writeFile(resolve(output,'units-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
