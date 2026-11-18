import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {zipSync,strToU8} from 'fflate';
import {importArchive} from '../../packages/ork-format/src/index.js';
import {tubePropertyInput} from '../../packages/ork-format/src/tube-properties.js';
import {prepare,java,output,repo} from './fixtures.mjs';
await prepare();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const report={outcome:'running',browser:browser.version(),cases:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ORK_POC_URL||'http://127.0.0.1:5173');
 await page.getByRole('heading',{name:'Body tube',exact:true}).waitFor();
 async function read(path){return importArchive(new Uint8Array(await readFile(path)));}
 async function download(name){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ork',exact:true}).click();const file=await event;assert.equal(await file.failure(),null);const path=resolve(output,name);await file.saveAs(path);return path;}
 const fields={length:['BodyTube length (m)','Apply length'],thickness:['Wall thickness (m)','Apply wall thickness']};
 async function edit(property,value){await page.getByLabel(fields[property][0],{exact:true}).fill(String(value));await page.getByRole('button',{name:fields[property][1],exact:true}).click();await page.getByRole('status').filter({hasText:/Java .* edit accepted|No change/}).waitFor();}
 const richPath=resolve(output,'explicit/G1-A.ork'),rich=await read(richPath),richTube=rich.parsed.components.find(c=>c.name==='bodytube');
 // Regression for a real setter event whose clamped wall value is unchanged.
 let xml=rich.xml;const preset=richTube.children.find(c=>c.name==='preset'),wall=richTube.children.find(c=>c.name==='thickness');
 for(const span of [{start:preset.start,end:preset.end,text:''},{start:wall.contentStart,end:wall.contentEnd,text:'0.03'}].sort((a,b)=>b.start-a.start))xml=xml.slice(0,span.start)+span.text+xml.slice(span.end);
 const clampPath=resolve(output,'clamp-source.ork');await writeFile(clampPath,zipSync(Object.fromEntries(rich.entries.map(e=>[e.path,e.path==='rocket.ork'?strToU8(xml):e.bytes])),{mtime:new Date(1980,0,1)}));
 for(const [name,source,edits] of [
  ['sample',resolve(repo,'web/app/public/rocket-sample.ork'),[['length',.55],['thickness',.002]]],
  ['rich',richPath,[['length',.45],['thickness',.002],['thickness',.9]]],
  ['clamp-event',clampPath,[['thickness',.9]]],
 ]) {
  await page.getByLabel('Open local .ork').setInputFiles(source);
  await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
  let currentPath=source,current=await read(source);const id=current.parsed.components.find(c=>c.name==='bodytube').id;
  for(const [index,[property,value]] of edits.entries()){
   const input=tubePropertyInput(current,id),beforePoints=await page.getByTestId(`rocket-part-${id}`).getAttribute('points');
   // True no-ops retain the exact archive, preset and loaded results.
   await edit(property,input[property]);assert.deepEqual(await readFile(await download(`${name}-${index}-noop.ork`)),await readFile(currentPath));
   await page.getByLabel(fields[property][0],{exact:true}).fill('NaN');await page.getByRole('button',{name:fields[property][1],exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Enter a finite value'}).waitFor();assert.deepEqual(await readFile(await download(`${name}-${index}-invalid.ork`)),await readFile(currentPath));
   await edit(property,value);
   const editedPath=await download(`${name}-${index}-${property}.ork`),edited=await read(editedPath),next=tubePropertyInput(edited,id);
   const directory=resolve(output,`desktop-${name}-${index}`);await mkdir(directory,{recursive:true});
   const oraclePath=resolve(directory,'report.json');await java('EditorDesktopProof',['property',currentPath,editedPath,id,property,String(value),oraclePath],`${name}-${index}-property`);
   const desktop=JSON.parse(await readFile(oraclePath,'utf8'));
   assert.equal(Number(await page.getByTestId('mass').textContent()),desktop.after.mass);
   assert.equal(Number(await page.getByTestId('cg').textContent()),desktop.after.cg);
   const mass=next.density*Math.PI*(next.radius**2-(next.radius-next.thickness)**2)*next.length;
   assert.ok(Math.abs(desktop.after.mass-mass)<1e-12);assert.equal(desktop.after.cg,next.length/2);
   if(property==='length')assert.notEqual(await page.getByTestId(`rocket-part-${id}`).getAttribute('points'),beforePoints);
   if(name==='clamp-event'){assert.equal(next.thickness,input.thickness);assert.equal(desktop.functionalChange,true);assert.deepEqual(desktop.statusesAfter,Array(6).fill('outdated'));}
   // Every opaque/identity/reference/result byte outside the accepted spans stays exact.
   const target=current.parsed.components.find(c=>c.id===id),replacements=[];
   const field=current.parsed.components.find(c=>c.id===id).children.find(c=>c.name===property);replacements.push({start:field.contentStart,end:field.contentEnd,text:String(next[property])});
   if(input.preset&&!next.preset){const preset=target.children.find(c=>c.name==='preset');replacements.push({start:preset.start,end:preset.end,text:''});}
   let expected=current.xml;for(const span of replacements.sort((a,b)=>b.start-a.start))expected=expected.slice(0,span.start)+span.text+expected.slice(span.end);
   if(desktop.functionalChange)expected=expected.replace(/<simulation status="loaded"/g,'<simulation status="outdated"');
   assert.ok(edited.xml===expected,'Complete XML outside accepted property/preset/status spans must be exact');
   assert.deepEqual(edited.entries.filter(e=>e.path!=='rocket.ork').map(e=>[e.path,e.sha256]),current.entries.filter(e=>e.path!=='rocket.ork').map(e=>[e.path,e.sha256]));
   await page.getByLabel('Open local .ork').setInputFiles(editedPath);await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
   assert.equal(Number(await page.getByTestId(property).textContent()),next[property]);
   report.cases.push({name,property,value,...desktop,opaqueXmlAndAttachmentsExact:true});currentPath=editedPath;current=edited;
  }
  if(name==='sample')await page.screenshot({path:resolve(output,'expanded-properties.png'),fullPage:true});
 }
 await page.getByLabel('Open local .ork').setInputFiles(resolve(output,'ring/G1-A.ork'));await page.getByRole('status').filter({hasText:'Archive opened'}).waitFor();
 assert.equal(await page.getByLabel('BodyTube length (m)',{exact:true}).isDisabled(),true);
 await page.getByText(/Additional tube properties require/).first().waitFor();
 assert.deepEqual(errors,[]);report.outcome='passed';console.log('Expanded property UI/desktop/preservation tests passed: length, wall, no-ops, invalid edits, clamping, preset effects and stored-result events.');
} catch(error){report.outcome='failed';report.error=String(error);throw error;}
finally {await writeFile(resolve(output,'properties-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
