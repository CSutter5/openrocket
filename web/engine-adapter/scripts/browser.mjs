import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const javascript = await readFile(resolve(root, 'build/generated/teavm/js/openrocket-g1-engine.js'));
const server = createServer((request, response) => {
  if (request.url === '/engine.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(javascript); }
  else if (request.url === '/worker.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(`import * as engine from './engine.js';
      onmessage = ({data}) => {
        try { const started=performance.now(); postMessage({id:data.id,started:true}); const result=engine[data.method](...data.args); postMessage({id:data.id,result,durationMs:performance.now()-started}); }
        catch(error) { postMessage({id:data.id, error:String(error)}); }
      };`);
  } else response.end('<!doctype html><title>OpenRocket G1 engine proof</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const worker = new Worker('/worker.js', {type:'module'});
    let id = 0;
    const pending = new Map();
    const timings=[];
    worker.onmessage = ({data}) => { if (data.started) return; const pair = pending.get(data.id); clearTimeout(pair.timer); timings.push(data.durationMs); if (data.error) pair.reject(new Error(data.error)); else pair.resolve(data.result); pending.delete(data.id); };
    worker.onerror = event => { for (const pair of pending.values()) pair.reject(new Error(event.message)); };
    const call = (method, ...args) => new Promise((resolve, reject) => { pending.set(++id,{resolve,reject,timer:setTimeout(()=>reject(new Error('worker timeout')),30000)}); worker.postMessage({id,method,args}); });
    let pageTicks=0; const tickTimer=setInterval(()=>pageTicks++,10);
    const start = performance.now();
    const calculations = JSON.parse(await call('calculations'));
    const editing = JSON.parse(await call('editing'));
    const flights = [JSON.parse(await call('flight',false)),JSON.parse(await call('flight',true))];
    const durationMs = performance.now() - start;
    worker.terminate(); clearInterval(tickTimer);
    if (pageTicks === 0) throw new Error('page did not remain responsive');
    const cancellable = new Worker('/worker.js',{type:'module'});
    let completed=false;
    const began = new Promise((resolve,reject)=> {
      const timer=setTimeout(()=>reject(new Error('cancel worker startup timeout')),30000);
      cancellable.onmessage=({data})=>{if(data.started){clearTimeout(timer);resolve();}else completed=true;};
      cancellable.onerror=event=>reject(new Error(event.message));
    });
    cancellable.postMessage({id:1,method:'flight',args:[true]});
    await began; await new Promise(resolve=>setTimeout(resolve,10));
    if (completed) throw new Error('simulation completed before cancellation exercise');
    const cancelStart=performance.now(); cancellable.terminate();
    await new Promise(resolve=>setTimeout(resolve,100));
    if (completed) throw new Error('cancelled simulation returned a completed result');
    return {calculations,editing,flights,durationMs,workerMethodMs:timings,pageTicks,cancellation:{completed:false,observationMs:performance.now()-cancelStart}};
  });
  const referenceLines = (await readFile(resolve(root,'build/reference.jsonl'),'utf8')).trim().split('\n').filter(line => line.startsWith('{')).map(JSON.parse);
  const observed = [result.calculations, result.editing];
  const limits = {atmosphere:[1e-10,1e-6,1e-10,1e-10], wind:[1e-12,1e-25,1e-12]};
  const maxima = {};
  for (const key of ['atmosphere','wind']) {
    maxima[key] = Array(limits[key].length).fill(0);
    referenceLines[0][key].forEach((row,i) => row.forEach((value,j) => {
      const error = Math.abs(value - observed[0][key][i][j]);
      maxima[key][j] = Math.max(maxima[key][j],error);
      if (!Number.isFinite(error) || error > limits[key][j]) throw new Error(`${key}[${i}][${j}] ${error} > ${limits[key][j]}`);
    }));
  }
  const compare = (expected, actual, path='editing') => {
    if (typeof expected === 'number') { if (!Number.isFinite(actual) || Math.abs(expected-actual) > 1e-13) throw new Error(`${path}: ${expected} != ${actual}`); }
    else if (typeof expected === 'object' && expected !== null) { if (actual === null || typeof actual !== 'object' || JSON.stringify(Object.keys(expected)) !== JSON.stringify(Object.keys(actual))) throw new Error(`${path}: keys differ`); for (const key of Object.keys(expected)) compare(expected[key],actual[key],`${path}.${key}`); }
    else if (expected !== actual) throw new Error(`${path}: ${expected} != ${actual}`);
  };
  compare(referenceLines[1],observed[1]);
  const flightComparisons=[];
  const columnLimits=[0.001,0.12,0.25,3]; // dt/50, then bounded velocity/acceleration/motor-jerk propagation.
  for (let index=0; index<2;index++) {
    const expected=referenceLines[index+2], actual=result.flights[index];
    if (expected.rk6 !== actual.rk6 || expected.warningCount !== actual.warningCount || expected.events.length !== actual.events.length || expected.series.length !== actual.series.length) throw new Error('flight structural mismatch');
    const scalarErrors={};
    for (const [key,tolerance] of Object.entries({mass:1e-12,cg:1e-10,cp:1e-10})) {
      const error=Math.abs(expected[key]-actual[key]); scalarErrors[key]=error;
      if (!Number.isFinite(error) || error>tolerance) throw new Error(`${key} difference ${error}`);
    }
    const summaryLimits=[0.001,0.000001,0.001,0.001]; // altitude, velocity, apogee time, flight time.
    const summaryErrors=expected.summary.map((value,i)=>Math.abs(value-actual.summary[i]));
    summaryErrors.forEach((error,i)=>{if(!Number.isFinite(error)||error>summaryLimits[i])throw new Error(`summary[${i}] difference ${error}`);});
    const eventErrors=expected.events.map((event,i)=>{
      if(event[0]!==actual.events[i][0])throw new Error(`event order ${i}`);
      const error=Math.abs(event[1]-actual.events[i][1]);
      if(!Number.isFinite(error)||error>0.001)throw new Error(`event time ${event[0]} difference ${error}`);
      return [event[0],error];
    });
    const maxAbsoluteErrors=[0,0,0,0],maxRelativeErrors=[0,0,0,0];
    expected.series.forEach((row,i)=>row.forEach((value,j)=>{
      const error=Math.abs(value-actual.series[i][j]);
      if(!Number.isFinite(error)||error>columnLimits[j])throw new Error(`series[${i}][${j}] difference ${error}`);
      maxAbsoluteErrors[j]=Math.max(maxAbsoluteErrors[j],error);
      if(Math.abs(value)>1e-9)maxRelativeErrors[j]=Math.max(maxRelativeErrors[j],error/Math.abs(value));
    }));
    const comparison={stepper:index?'RK6':'RK4',rows:actual.series.length,scalarErrors,summaryErrors,eventErrors,maxAbsoluteErrors,maxRelativeErrors,absoluteLimits:columnLimits,summaryLimits,relativeFloor:1e-9};
    flightComparisons.push(comparison);
    console.log(JSON.stringify(comparison));
  }
  const sea = result.calculations.atmosphere[0];
  if (Math.abs(sea[2] - 101325/(287.053*288.15)) > 1e-12) throw new Error('ideal gas density independent check');
  for (const flight of result.flights) {
    if (Math.abs(flight.motorImpulse-10.4)>1e-12 || Math.abs(flight.motorThrustSamples[0]-6)>1e-12 || Math.abs(flight.motorThrustSamples[1]-9)>1e-12) throw new Error('independent trapezoid impulse/interpolation check');
  }
  if (result.editing.after.tube.cg !== 0.15) throw new Error('independent uniform cylinder centroid');
  const mass = 680*Math.PI*0.005**2*0.3;
  if (Math.abs(result.editing.after.tube.mass - mass) > 1e-13) throw new Error('solid cylinder independent mass check');
  const report = {runtime:await browser.version(), artifactBytes:javascript.length, maxAbsoluteErrors:maxima,flightComparisons, ...result};
  await writeFile(resolve(root,'build/browser-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({runtime:report.runtime,artifactBytes:report.artifactBytes,maxAbsoluteErrors:maxima,durationMs:report.durationMs,workerMethodMs:report.workerMethodMs,pageTicks:report.pageTicks,cancellation:report.cancellation}));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
