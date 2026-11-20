import { openProperties, closeProperties, flights } from './workspace.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout} from 'node:timers/promises';
import {chromium} from 'playwright';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {importArchive,sha256} from '../../packages/ork-format/src/index.js';
import {flightInput,flightSupport,flightConfigurations} from '../src/simulation/input.ts';
import {prepare,java,repo,output} from './fixtures.mjs';
await prepare();
const fixture=resolve(output,'imported-flight.ork'),generatedCatalog=resolve(output,'flight-motors.json');
await java('FlightCatalogExporter',[resolve(repo,'core/src/main/resources/datafiles/thrustcurves/initial_motors.db'),generatedCatalog],'imported-catalog');
assert.deepEqual(JSON.parse(await readFile(generatedCatalog,'utf8')),JSON.parse(await readFile(resolve(repo,'web/app/src/simulation/motors.json'),'utf8')));
await java('ImportedFlightDesktopProof',['generate',resolve(repo,'web/app/public/flight-ready.ork'),fixture],'imported-generate');
let bytes=await readFile(fixture);const entries=unzipSync(bytes);
// Inert output expressions and an opaque attachment are retained, never evaluated.
entries['rocket.ork']=strToU8(strFromU8(entries['rocket.ork']).replace('<simulations>','<datatypes><type source="customexpression"><name>Energy</name><symbol>Ek</symbol><unit unittype="auto">J</unit><expression>0.5*m*Vt^2</expression></type></datatypes><simulations>'));
entries['opaque/flight.bin']=new Uint8Array([0,255,9,37]);bytes=Buffer.from(zipSync(entries));await writeFile(fixture,bytes);
const archive=await importArchive(new Uint8Array(bytes));assert.ok(archive.parsed.simulations.length);assert.equal(flightSupport(archive).supported,true);
const choices=flightConfigurations(archive),defaultId=choices.find(c=>c.isDefault).id,alternateId=choices.find(c=>c.label.includes('Fast flight')).id,emptyId=choices.at(-1).id;
assert.equal(choices.length,5);assert.match(choices.find(c=>c.id===alternateId).label,/J800T/);
assert.equal(flightSupport(archive,emptyId).supported,false);
await assert.rejects(flightInput(archive,'unknown-configuration'),/Unknown selected/);

function compare(expected,actual) {
  assert.equal(actual.rk6,expected.rk6);assert.equal(actual.warningCount,expected.warningCount);const warningText=s=>s.replace('[Warning.Warning.','[Warning.');assert.deepEqual(actual.warnings.map(warningText),expected.warnings.map(warningText));
  function same(a,b){if(typeof a==='number')assert.ok(Number.isFinite(b)&&Math.abs(a-b)<1e-10);else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))same(a[k],b[k]);}else assert.equal(a,b);}
  same(expected.inputs,actual.inputs);
  for(const k of ['mass','cg','cp'])assert.ok(Math.abs(expected[k]-actual[k])<1e-10);
  assert.equal(expected.events.length,actual.events.length);
  const columnLimits=[.001,.12,.25,3],summaryLimits=[.001,.000001,.001,.001];
  assert.equal(expected.series.length,actual.series.length);
  const eventErrors=expected.events.map(([name,time],i)=>{assert.equal(actual.events[i][0],name);const error=Math.abs(actual.events[i][1]-time);assert.ok(error<=.001,`${name}: ${error}`);return [name,error];});
  const summaryErrors=expected.summary.map((v,i)=>{const error=Math.abs(v-actual.summary[i]);assert.ok(error<=summaryLimits[i],`summary ${i}: ${error}>${summaryLimits[i]}`);return error;});
  const maxSeriesErrors=[0,0,0,0];
  expected.series.forEach((row,i)=>row.forEach((value,j)=>{const error=Math.abs(value-actual.series[i][j]);assert.ok(Number.isFinite(error)&&error<=columnLimits[j],`series ${i}/${j}: ${error}`);maxSeriesErrors[j]=Math.max(maxSeriesErrors[j],error);}));
  const tube=actual.inputs.components.find(c=>c.type==='BodyTube');
  assert.ok(Math.abs(tube.mass-950*Math.PI*(tube.radius**2-(tube.radius-tube.thickness)**2)*tube.length)<1e-12);assert.equal(tube.cg,tube.length/2);
  return {rows:[expected.series.length,actual.series.length],eventErrors,summaryErrors,summaryLimits,maxSeriesErrors,columnLimits,completeInputsAndSerialization:true};
}
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const report={outcome:'running',browser:browser.version(),comparisons:[],checks:[]};
try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const Native=Worker;window.replies=[];window.heldFlights=[];window.holdFlights=false;window.ticks=0;setInterval(()=>window.ticks++,10);window.Worker=class extends Native{constructor(url,options){super(url,options);if(String(url).includes('simulation.worker'))this.addEventListener('message',e=>{window.replies.push({...e.data,ticks:window.ticks});if(e.data.type==='completed'&&window.holdFlights){window.heldFlights.push({worker:this,data:e.data});e.stopImmediatePropagation();}});}};});
 await page.goto(process.env.ORK_POC_URL||'http://127.0.0.1:5173');
  await flights(page);
 await page.getByLabel('Open local .ork').setInputFiles(fixture);await page.getByText('imported-flight.ork',{exact:true}).waitFor();
 assert.equal(await page.getByTestId('flight-unsupported').count(),0);
 await page.getByText(/Saved desktop simulations and custom expression columns/).waitFor();
 await page.getByText(/Motor data resolved by exact digest/).waitFor();
 const configuration=page.getByLabel('Motor configuration',{exact:true});
 assert.equal(await configuration.inputValue(),defaultId);
 async function choose(id){await configuration.selectOption(id);await page.waitForFunction(id=>{const select=document.getElementById('flight-configuration');return select.value===id&&!select.disabled;},id);}
 const run=()=>page.getByRole('button',{name:/^(Run|Restart) flight$/,exact:true}).click();
 async function finished(){await page.getByTestId('flight-status').filter({hasText:'Flight completed.'}).waitFor({timeout:60000});return page.evaluate(()=>window.replies.filter(r=>r.type==='completed').at(-1).result);}
 let identityHash;
 for(const integrator of ['RK4','RK6']){
  await page.getByLabel('Flight integrator',{exact:true}).selectOption(integrator);await run();const actual=await finished();assert.equal(actual.flight.rk6,integrator==='RK6');
  assert.equal(actual.provenance.archiveTreeHash,await sha256(new Uint8Array(bytes)));
  if(identityHash)assert.equal(actual.provenance.identitySidecarHash,identityHash);identityHash=actual.provenance.identitySidecarHash;
  const model=resolve(output,`imported-${integrator}-model.txt`),reference=resolve(output,`imported-${integrator}-jvm.json`);
  await writeFile(model,(await flightInput(archive)).model);await java('ImportedFlightDesktopProof',['reference',fixture,model,reference,String(integrator==='RK6')],`imported-${integrator}-reference`);
  const expected=JSON.parse(await readFile(reference,'utf8'));report.comparisons.push({integrator,...compare(expected,actual.flight)});
  await writeFile(resolve(output,`imported-${integrator}-browser.json`),JSON.stringify(actual,null,2));
 }
 const defaultResult=await page.evaluate(()=>window.replies.filter(r=>r.type==='completed').at(-1).result);
 await choose(alternateId);await page.getByRole('heading',{name:/Stale session result/}).waitFor();
 for(const integrator of ['RK4','RK6']){
  await page.getByLabel('Flight integrator',{exact:true}).selectOption(integrator);await run();const actual=await finished();
  assert.equal(actual.provenance.configurationId,alternateId);assert.notEqual(actual.inputHash,defaultResult.inputHash);
  assert.notEqual(actual.flight.inputs.motorDigest,defaultResult.flight.inputs.motorDigest);
  assert.notEqual(actual.flight.summary[0],defaultResult.flight.summary[0]);assert.equal(actual.provenance.archiveTreeHash,defaultResult.provenance.archiveTreeHash);
  const model=resolve(output,`configuration-${integrator}-model.txt`),reference=resolve(output,`configuration-${integrator}-jvm.json`);
  await writeFile(model,(await flightInput(archive,alternateId)).model);await java('ImportedFlightDesktopProof',['reference',fixture,model,reference,String(integrator==='RK6'),alternateId],`configuration-${integrator}-reference`);
  report.comparisons.push({integrator:integrator+' alternate J800T',...compare(JSON.parse(await readFile(reference,'utf8')),actual.flight)});
 }
 await page.getByLabel('Length units',{exact:true}).selectOption('in');await page.getByRole('heading',{name:'Current session result',exact:true}).waitFor();assert.equal(await configuration.inputValue(),alternateId);await page.getByLabel('Length units',{exact:true}).selectOption('m');
 // Hold genuine worker completions to exercise selection while a captured flight finishes.
 await page.evaluate(()=>window.holdFlights=true);await run();await page.waitForFunction(()=>window.heldFlights.length===1);
 await choose(defaultId);await page.evaluate(()=>{window.holdFlights=false;const held=window.heldFlights.shift();held.worker.dispatchEvent(new MessageEvent('message',{data:held.data}));});await finished();await page.getByRole('heading',{name:/Stale session result/}).waitFor();
 assert.equal((await page.evaluate(()=>window.replies.filter(r=>r.type==='completed').at(-1).result)).provenance.configurationId,alternateId);
 // Restart on a different configuration, then deliver the superseded completion.
 await choose(alternateId);await page.evaluate(()=>window.holdFlights=true);await run();await page.waitForFunction(()=>window.heldFlights.length===1);
 await choose(defaultId);await page.evaluate(()=>window.holdFlights=false);await run();const newer=await finished();assert.equal(newer.provenance.configurationId,defaultId);
 await page.evaluate(()=>{const held=window.heldFlights.shift();held.worker.dispatchEvent(new MessageEvent('message',{data:held.data}));});assert.equal(await page.getByTestId('flight-input-hash').textContent(),newer.inputHash);await page.getByRole('heading',{name:'Current session result',exact:true}).waitFor();
 await choose(emptyId);await page.getByTestId('flight-unsupported').waitFor();assert.equal(await page.getByRole('button',{name:'Run flight',exact:true}).isDisabled(),true);
 await choose(alternateId);assert.equal(await page.getByTestId('flight-unsupported').count(),0);
 report.checks.push('configuration selector: default and J800T with per-configuration recovery on both steppers/JVM; selected configuration retained across units/edits, stale genuine completion, superseded late rejection, empty-motor refusal/recovery');
 report.checks.push('actual UI import with saved conditions, default configuration, exact catalog motor source, two recoveries, mass/CG overrides, transition and internals; RK4/RK6 against JVM');
 const messages=await page.evaluate(()=>window.replies);assert.ok(messages.filter(r=>r.type==='completed').every(r=>r.ticks>messages.find(s=>s.jobId===r.jobId&&s.type==='running').ticks));
 const down=async()=>{const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download .ork',exact:true}).click();return readFile(await (await event).path());};
 assert.deepEqual(await down(),bytes);
 await run();await page.getByTestId('flight-status').filter({hasText:'Running Java'}).waitFor();await page.getByRole('button',{name:'Cancel flight',exact:true}).click();await page.getByTestId('flight-status').filter({hasText:'Flight cancelled'}).waitFor();await setTimeout(200);assert.deepEqual(await down(),bytes);
 await openProperties(page);
 await page.getByLabel('BodyTube length (m)',{exact:true}).fill('1.25');await page.getByRole('button',{name:'Apply length',exact:true}).click();await page.getByTestId('length').filter({hasText:'1.25'}).waitFor();assert.equal(await configuration.inputValue(),alternateId);await page.getByRole('heading',{name:/Stale session result/}).waitFor();
 await closeProperties(page);
 const edited=await down(),editedPath=resolve(output,'imported-edited.ork');await writeFile(editedPath,edited);await run();const result=await finished();
 const model=resolve(output,'imported-edited-model.txt'),reference=resolve(output,'imported-edited-jvm.json');await writeFile(model,(await flightInput(await importArchive(new Uint8Array(edited)),alternateId)).model);
 await java('ImportedFlightDesktopProof',['reference',editedPath,model,reference,'true',alternateId],'imported-edited-reference');report.comparisons.push({integrator:'RK6 edited',...compare(JSON.parse(await readFile(reference,'utf8')),result.flight)});
 assert.deepEqual(await down(),edited);
 const priorIdentity=result.provenance.identitySidecarHash;
 await page.getByLabel('Open local .ork').setInputFiles(editedPath);await page.getByText('imported-edited.ork',{exact:true}).waitFor();assert.equal(await configuration.inputValue(),defaultId);await page.getByRole('heading',{name:/Stale session result/}).waitFor();
 await run();const reimported=await finished();assert.notEqual(reimported.provenance.identitySidecarHash,priorIdentity);assert.equal(reimported.provenance.archiveTreeHash,result.provenance.archiveTreeHash);
 report.checks.push('responsive Java worker, cancellation, stable stored-simulation sidecar binding, edited rerun/staleness, exact original and edited archive preservation');
 assert.deepEqual(errors,[]);report.outcome='passed';console.log('Imported flight UI/JVM regression passed with independent fixture; no user archive dependency.');
}catch(error){report.outcome='failed';report.error=String(error);throw error;}
finally{await writeFile(resolve(output,'imported-flight-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
