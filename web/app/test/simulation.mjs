import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { flightInput, flightSupport } from '../src/simulation/input.ts';
import { prepare, java, output, repo } from './fixtures.mjs';
await import('./simulation-jobs.mjs');
await prepare();
const sample=resolve(repo,'web/app/public/flight-ready.ork'), original=await readFile(sample);
await java('SimulationDesktopProof',['generate',resolve(output,'flight-regenerated.ork')],'flight-generate');
const generated=unzipSync(await readFile(resolve(output,'flight-regenerated.ork'))), bundled=unzipSync(original);
assert.deepEqual(Object.keys(generated),Object.keys(bundled));
for(const name of Object.keys(bundled)) assert.deepEqual(generated[name],bundled[name],`Desktop fixture generator changed ${name}`);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE}: {})});
const report={outcome:'running',browser:browser.version(),comparisons:[],checks:[]};
const columnLimits=[.001,.12,.25,3], summaryLimits=[.001,.000001,.001,.001];
function compare(expected,actual,key) {
  assert.equal(actual.rk6,expected.rk6);assert.deepEqual(actual.warnings,expected.warnings);assert.equal(actual.warningCount,expected.warningCount);
  function inputs(a,b,path='inputs') {
    if(typeof a==='number') assert.ok(Number.isFinite(b)&&Math.abs(a-b)<=1e-12,`${key} ${path}: ${a} vs ${b}`);
    else if(a&&typeof a==='object') {assert.deepEqual(Object.keys(a),Object.keys(b));for(const name of Object.keys(a))inputs(a[name],b[name],path+'.'+name);}
    else assert.equal(a,b);
  }
  inputs(expected.inputs,actual.inputs);
  const scalarErrors={};
  for(const [name,limit] of Object.entries({mass:1e-12,cg:1e-10,cp:1e-10})) {const error=Math.abs(expected[name]-actual[name]);assert.ok(Number.isFinite(error)&&error<=limit,`${key} ${name}: ${error}`);scalarErrors[name]=error;}
  assert.equal(actual.events.length,expected.events.length);assert.equal(actual.series.length,expected.series.length);
  const eventErrors=expected.events.map(([name,time],i)=>{assert.equal(actual.events[i][0],name);const error=Math.abs(actual.events[i][1]-time);assert.ok(Number.isFinite(error)&&error<=.001,`${key} event ${name}: ${error}`);return [name,error];});
  const summaryErrors=expected.summary.map((value,i)=>{const error=Math.abs(value-actual.summary[i]);assert.ok(Number.isFinite(error)&&error<=summaryLimits[i],`${key} summary ${i}: ${error}`);return error;});
  const maxAbsoluteErrors=[0,0,0,0];
  expected.series.forEach((row,i)=>row.forEach((value,j)=>{const error=Math.abs(value-actual.series[i][j]);assert.ok(Number.isFinite(error)&&error<=columnLimits[j],`${key} series ${i}/${j}: ${error}`);maxAbsoluteErrors[j]=Math.max(maxAbsoluteErrors[j],error);}));
  assert.ok(Math.abs(actual.motorImpulse-10.4)<1e-12);assert.deepEqual(actual.motorThrustSamples,[6,9]);
  const body=actual.inputs.components.find(c=>c.type==='BodyTube');
  assert.ok(Math.abs(body.mass-950*Math.PI*(body.radius**2-(body.radius-body.thickness)**2)*body.length)<1e-13);
  assert.equal(body.cg,body.length/2);
  return {key,rows:actual.series.length,eventErrors,summaryErrors,scalarErrors,maxAbsoluteErrors,columnLimits,summaryLimits,inputsEqual:true,completeRocketSerializationEqual:true,independentMotorAndTubeChecks:true};
}
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const Native=Worker;
    window.flightMessages=[];window.flightWorkers=[];window.workerObservations=[];window.pageTicks=0;window.activeFlight=null;
    setInterval(()=>window.pageTicks++,10);
    window.Worker=class extends Native {
      constructor(url,options) {
        super(url,options);this.flight=String(url).includes('simulation.worker');
        if(this.flight)window.flightWorkers.push(this);
        this.addEventListener('message',event=>{
          if(this.flight) {window.flightMessages.push({...event.data,observedAt:performance.now(),pageTicks:window.pageTicks}); if(event.data.type==='running')window.activeFlight=event.data.jobId; else if(event.data.jobId===window.activeFlight)window.activeFlight=null;}
        });
      }
      postMessage(data,...rest) {this.sent=data;window.workerObservations.push({event:'post',flight:this.flight,type:data.action?.type,computing:window.activeFlight!==null,at:performance.now()});return super.postMessage(data,...rest);}
      terminate() {window.workerObservations.push({event:'terminate',flight:this.flight,at:performance.now()});return super.terminate();}
    };
  });
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:5173');
  const panel=page.getByRole('region',{name:'Local flight simulation'}), status=page.getByTestId('flight-status');
  const result=page.getByTestId('flight-result'), stepper=page.getByLabel('Flight integrator',{exact:true});
  const open=()=>page.getByRole('button',{name:'Open flight-ready sample',exact:true}).click();
  const run=()=>panel.getByRole('button',{name:/^(Run|Restart) flight$/}).click();
  const complete=()=>status.filter({hasText:'Flight completed.'}).waitFor();
  const latest=()=>page.evaluate(()=>window.flightMessages.filter(m=>m.type==='completed').at(-1).result);
  let previousDownload=0;
  async function download(name) {
    // Pace the preservation matrix's burst of downloads through Chromium.
    await setTimeout(Math.max(0,250-(Date.now()-previousDownload))); previousDownload=Date.now();
    const event=page.waitForEvent('download',{timeout:10000});await page.getByRole('button',{name:'Download .ork',exact:true}).click();
    const file=await event.catch(async error=>{await page.screenshot({path:resolve(output,'flight-download-failure.png'),fullPage:true});throw new Error(error.message+' · '+(await page.locator('main').innerText()));});assert.equal(await file.failure(),null);const bytes=await readFile(await file.path());
    if(name)await writeFile(resolve(output,name),bytes);return bytes;
  }
  async function reference(bytes,actual,key) {
    const path=resolve(output,key+'.ork'),model=resolve(output,key+'-model.txt'),ref=resolve(output,key+'-jvm.json');
    await writeFile(path,bytes);await writeFile(model,(await flightInput(await importArchive(new Uint8Array(bytes)))).model);
    await java('SimulationDesktopProof',['reference',path,model,ref,String(actual.flight.rk6)],key+'-reference');
    const expected=JSON.parse(await readFile(ref,'utf8'));
    report.comparisons.push(compare(expected,actual.flight,key));await writeFile(resolve(output,key+'-browser.json'),JSON.stringify(actual,null,2));
  }
  await open(); await panel.getByText(/Supported flight configuration/).waitFor();
  await panel.getByText(/synthetic curve, not certified motor data/).waitFor();
  await panel.getByText('Run settings · bounded and read-only',{exact:true}).click();
  await panel.getByText('42 (deterministic)',{exact:true}).waitFor();
  assert.deepEqual(await download(),original);
  for(const integrator of ['RK4','RK6']) {
    await stepper.selectOption(integrator);await run();await complete();
    await reference(original,await latest(),'flight-sample-'+integrator);
  }
  const baseline=await latest();
  report.responsiveness=await page.evaluate(()=>window.flightMessages.filter(m=>m.type==='completed').map(m=>({jobId:m.jobId,computingPageTicks:m.pageTicks-window.flightMessages.find(s=>s.jobId===m.jobId&&s.type==='running').pageTicks})));
  assert.ok(report.responsiveness.every(r=>r.computingPageTicks>0));
  await page.getByLabel('Length units',{exact:true}).selectOption('in');
  await result.getByRole('heading',{name:'Current session result',exact:true}).waitFor();
  assert.ok(Math.abs(Number(await page.getByTestId('flight-altitude').textContent())-baseline.flight.summary[0]/.0254)<.00006);
  assert.equal(await page.getByTestId('flight-input-hash').textContent(),baseline.inputHash);assert.deepEqual(await download(),original);
  await page.getByLabel('Length units',{exact:true}).selectOption('m');
  report.checks.push('UI configuration, motor, settings, RK4/RK6, summary/plot/events/warnings and SI/inches presentation');
  const cancelStart=await page.evaluate(()=>({ticks:window.pageTicks,messages:window.flightMessages.length}));
  await run();await status.filter({hasText:'Running Java'}).waitFor();
  const cancelled=await page.evaluate(()=>({id:window.flightWorkers.at(-1).sent.jobId,computing:window.flightMessages.at(-1).type==='running'}));
  assert.equal(cancelled.computing,true);
  await panel.getByRole('button',{name:'Cancel flight',exact:true}).click();await status.filter({hasText:'Flight cancelled'}).waitFor();
  await setTimeout(200);
  assert.equal(await page.evaluate(id=>window.flightMessages.some(m=>m.jobId===id&&m.type==='completed'),cancelled.id),false);
  await page.evaluate(({baseline,id})=>{const w=window.flightWorkers.at(-1);w.dispatchEvent(new MessageEvent('message',{data:{jobId:id,inputHash:baseline.inputHash,type:'completed',result:baseline}}));},{baseline,id:cancelled.id});
  await status.filter({hasText:'Flight cancelled'}).waitFor();
  assert.deepEqual(await download(),original);
  report.cancellation=await page.evaluate(start=>({pageTicks:window.pageTicks-start.ticks,simulationWorkersTerminated:window.workerObservations.filter(o=>o.event==='terminate'&&o.flight).length,documentWorkersTerminated:window.workerObservations.filter(o=>o.event==='terminate'&&!o.flight).length,computingAcknowledged:true,noCompletionAfterTermination:true,lateCompletionRejected:true}),cancelStart);
  assert.ok(report.cancellation.pageTicks>0);assert.equal(report.cancellation.documentWorkersTerminated,0);
  report.checks.push('real computing worker termination; page heartbeat; accepted archive unchanged; injected late completion rejected');
  await page.getByLabel('BodyTube length (m)',{exact:true}).fill('0.35');
  await page.getByRole('button',{name:'Apply length',exact:true}).click();
  await page.getByTestId('length').filter({hasText:'0.35'}).waitFor();
  await result.getByRole('heading',{name:/Stale session result/}).waitFor();
  const edited=await download('flight-edited.ork');
  for(const integrator of ['RK4','RK6']) {
    await stepper.selectOption(integrator);await run();await complete();
    const actual=await latest();assert.notEqual(actual.inputHash,baseline.inputHash);
    assert.equal(actual.flight.inputs.components.find(c=>c.type==='BodyTube').length,.35);
    assert.notEqual(actual.flight.summary[0],baseline.flight.summary[0]);
    await reference(edited,actual,'flight-edited-'+integrator);assert.deepEqual(await download(),edited);
  }
  report.checks.push('accepted physical edit changes simulation input and flight, marks results stale, both edited steppers match JVM');
  await run();await status.filter({hasText:'Running Java'}).waitFor();
  await page.getByLabel('BodyTube length (m)',{exact:true}).fill('0.36');await page.getByRole('button',{name:'Apply length',exact:true}).click();
  await page.getByTestId('length').filter({hasText:'0.36'}).waitFor();await complete();
  await result.getByRole('heading',{name:/Stale session result/}).waitFor();
  assert.equal((await latest()).flight.inputs.components.find(c=>c.type==='BodyTube').length,.35);
  const duringEdit=await download('flight-during-edit.ork');
  assert.equal((await flightInput(await importArchive(new Uint8Array(duringEdit)))).model.includes('bodytube/length\t0.36'),true);
  const edits=await page.evaluate(()=>window.workerObservations);
  const editedInFlight=edits.some(o=>o.type==='tubeProperty'&&o.computing);
  assert.ok(editedInFlight);
  await run();await status.filter({hasText:'Running Java'}).waitFor();
  await page.getByRole('button',{name:'Open explicit tube sample',exact:true}).click();
  await complete();await result.getByRole('heading',{name:/Stale session result/}).waitFor();
  assert.ok(await page.evaluate(()=>window.workerObservations.some(o=>o.type==='import'&&o.computing)));
  assert.deepEqual(await download(),await readFile(resolve(repo,'web/app/public/explicit-tube.ork')));
  await panel.getByTestId('flight-unsupported').waitFor();assert.equal(await panel.getByRole('button',{name:'Run flight',exact:true}).isDisabled(),true);
  report.checks.push('editing and replacement import during a flight retain accepted state; old completions displayed stale');
  await open();
  // A failed worker startup is visible and a new worker can recover normally.
  await page.route('**/simulation.worker-*.js',route=>route.abort('failed'));
  await run();await status.filter({hasText:'Flight failed'}).waitFor();
  await page.unroute('**/simulation.worker-*.js');
  await run();await complete();await result.getByRole('heading',{name:'Current session result',exact:true}).waitFor();
  await run();await status.filter({hasText:'Running Java'}).waitFor();
  const superseded=await page.evaluate(()=>window.flightWorkers.length-1);
  await stepper.selectOption('RK4');await run();await complete();assert.equal((await latest()).flight.rk6,false);
  const currentHash=await page.getByTestId('flight-input-hash').textContent();
  await page.evaluate(({baseline,index})=>{const w=window.flightWorkers[index];w.dispatchEvent(new MessageEvent('message',{data:{jobId:w.sent.jobId,inputHash:baseline.inputHash,type:'completed',result:baseline}}));},{baseline,index:superseded});
  assert.equal(await page.getByTestId('flight-input-hash').textContent(),currentHash);
  await result.getByRole('heading',{name:'Current session result',exact:true}).waitFor();
  await page.evaluate(baseline=>{const w=window.flightWorkers[0];w.dispatchEvent(new MessageEvent('message',{data:{jobId:w.sent.jobId,inputHash:baseline.inputHash,type:'completed',result:baseline}}));},baseline);
  assert.equal(await page.getByTestId('flight-input-hash').textContent(),currentHash);
  assert.deepEqual(await download(),original);
  report.checks.push('startup failure recovery, active-run restart with different settings, superseded/older worker late results cannot overwrite newer result');
  const xml=strFromU8(bundled['rocket.ork']);
  const cases=[
    ['document-settings',xml.replace('<docprefs>','<docprefs unknown="refuse">')],
    ['numeric-lexeme',xml.replace('<length>0.3</length>','<length>0x1</length>')],
    ['position',xml.replace('<axialoffset method="bottom">0.0','<axialoffset method="bottom">0.01')],
    ['extension',xml.replace('<simulations>','<simulations><simulation status="not_simulated"><name>Untrusted</name><extension extensionid="ScriptingExtension"><script>throw new Error("must not run")</script></extension></simulation>')],
    ['unknown-component-field',xml.replace('<finish>normal</finish>','<future:physics xmlns:future="urn:test"/><finish>normal</finish>')],
  ];
  for(const [field,value] of [['overridemass','0.1'],['overridecg','0.02']]) {
    const bytes=zipSync({...bundled,'rocket.ork':strToU8(xml.replace('<finish>normal</finish>',`<${field}>${value}</${field}><finish>normal</finish>`))});
    assert.equal(flightSupport(await importArchive(bytes)).supported,true,field+' imported support');
  }
  for(const [name,modified] of cases) {
    const bytes=zipSync({...bundled,'rocket.ork':strToU8(modified)});
    assert.equal(flightSupport(await importArchive(bytes)).supported,false,name);
    await page.getByLabel('Open local .ork').setInputFiles({name:name+'.ork',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
    await page.getByText(name+'.ork',{exact:true}).waitFor();
    await page.getByTestId('flight-unsupported').waitFor();assert.equal(await panel.getByRole('button',{name:'Run flight',exact:true}).isDisabled(),true,name);
    assert.deepEqual(await download(),Buffer.from(bytes));
  }
  for(const mode of ['missing','changed']) {
    const entries={...bundled};const motor=Object.keys(entries).find(n=>n.endsWith('.rse'));
    if(mode==='missing')delete entries[motor];else entries[motor]=strToU8(strFromU8(entries[motor]).replace('f="12.0"','f="12.1"'));
    const bytes=zipSync(entries);assert.equal(flightSupport(await importArchive(bytes)).supported,false);
    await page.getByLabel('Open local .ork').setInputFiles({name:'motor-'+mode+'.ork',mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
    await page.getByText('motor-'+mode+'.ork',{exact:true}).waitFor();
    await page.getByTestId('flight-unsupported').filter({hasText:'motor curve'}).waitFor();assert.deepEqual(await download(),Buffer.from(bytes));
  }
  const opaque=zipSync({...bundled,'rocket.ork':strToU8(xml.replace('</openrocket>','<!-- Opaque preservation marker: exact &amp; bytes -->\n</openrocket>')),'opaque/keep.bin':new Uint8Array([0,255,13,10,37])});
  await page.getByLabel('Open local .ork').setInputFiles({name:'flight-opaque.ork',mimeType:'application/octet-stream',buffer:Buffer.from(opaque)});
  await run();await complete();assert.deepEqual(await download(),Buffer.from(opaque));
  await run();await status.filter({hasText:'Running Java'}).waitFor();await panel.getByRole('button',{name:'Cancel flight',exact:true}).click();
  await status.filter({hasText:'Flight cancelled'}).waitFor();assert.deepEqual(await download(),Buffer.from(opaque));
  report.checks.push('supported flight with inert XML comment and opaque binary attachment preserves exact archive after run and cancel');
  report.checks.push('ambiguous positioning, imported extensions, unknown fields and unresolved/changed motors refuse; mass/CG override inputs now supported');
  await open();await run();await complete();await page.screenshot({path:resolve(output,'flight-workflow.png'),fullPage:true});
  assert.deepEqual(errors,[]);report.outcome='passed';
  console.log('Production Chromium archive simulation workflow passed: both steppers, edited inputs/JVM, responsive cancel, stale/race/failure recovery, unsupported refusals, archive preservation.');
} catch(error) {report.outcome='failed';report.error=String(error);throw error;}
finally {await writeFile(resolve(output,'simulation-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
