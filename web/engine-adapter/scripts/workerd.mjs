import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { Miniflare, convertV4MiniflareOptions } = await import(process.env.MINIFLARE_MODULE || 'miniflare');
const root = resolve(import.meta.dirname, '..');
const javascript = await readFile(resolve(root,'build/generated/teavm/js/reducer.js'),'utf8');
const reference = (await readFile(resolve(root,'build/reference.jsonl'),'utf8')).split('\n').filter(line=>line.startsWith('{')).map(JSON.parse);
const started = performance.now();
const config = convertV4MiniflareOptions({
  name:'engine',compatibilityDate:'2026-11-17', modules:[
    {type:'ESModule',path:'worker.js',contents:`import {editing,reset,state,command} from './engine.js';
      export default {async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/transcript') return Response.json(JSON.parse(editing()));
        if (path === '/reset') { reset(); return Response.json({ok:true}); }
        const text = await request.text();
        if (text.length > 2048) return new Response('request too large',{status:413});
        try {
          const input = JSON.parse(text);
          if (path === '/state') return Response.json(JSON.parse(state(input.projectId)));
          if (path !== '/command' || input.protocol !== 1 || input.modelSchema !== 1
              || input.branchId !== 'main' || input.epoch !== 1
              || !Number.isSafeInteger(input.observedSequence) || input.observedSequence < 0
              || typeof input.operationId !== 'string' || input.operationId.length < 1 || input.operationId.length > 64
              || typeof input.action !== 'string' || !Number.isFinite(input.expected) || !Number.isFinite(input.value)) {
            return new Response('invalid command envelope',{status:400});
          }
          return Response.json(JSON.parse(command(input.projectId,input.operationId,input.observedSequence,input.action,input.expected,input.value)));
        } catch (error) { return new Response('rejected',{status:409}); }
      }};`},
    {type:'ESModule',path:'engine.js',contents:javascript}
  ]
});
config.enableDevRegistry=false;
config.telemetry={enabled:false};
const mf = new Miniflare(config);
try {
  await mf.ready;
  const startupWallMs = performance.now()-started;
  const transcript = await (await mf.dispatchFetch('http://proof/transcript')).json();
  // Full relevant snapshots are compared through the common facade, including state after rejected commands.
  const compare = (a,b,path='state') => {
    assert.deepEqual(Object.keys(a),Object.keys(b),path);
    for (const key of Object.keys(a)) {
      if (a[key] && typeof a[key] === 'object') compare(a[key],b[key],`${path}.${key}`);
      else if (typeof a[key] === 'number') assert.ok(Math.abs(a[key]-b[key])<=1e-13,`${path}.${key}`);
      else assert.equal(a[key],b[key],`${path}.${key}`);
    }
  };
  compare(reference[1],transcript);
  await mf.dispatchFetch('http://proof/reset');
  const post = (path,input) => mf.dispatchFetch(`http://proof/${path}`,{method:'POST',body:JSON.stringify(input)});
  const envelope = {protocol:1,modelSchema:1,projectId:'project-a',branchId:'main',epoch:1,operationId:'a1',observedSequence:0,action:'radius',expected:0.025,value:0.005};
  const initialB = await (await post('state',{projectId:'project-b'})).json();
  const commandStart = performance.now();
  const a1 = await post('command',envelope); assert.equal(a1.status,200);
  const accepted = await a1.json();
  assert.equal(accepted.tube.radius,0.005); assert.equal(accepted.tube.thickness,0.005);
  assert.equal(accepted.tube.automatic,false); assert.equal(accepted.listener.radius,0.005);
  assert.equal(accepted.listener.thickness,0.005); assert.equal(accepted.automatic.radius,0.005);
  const a1wallMs = performance.now()-commandStart;
  assert.deepEqual(await (await post('state',{projectId:'project-b'})).json(),initialB);
  assert.deepEqual(await (await post('command',envelope)).json(),accepted);
  const badCases = [
    {...envelope,value:0.004},
    {...envelope,operationId:'cycle',observedSequence:1,action:'cycle',expected:0.005,value:0},
    {...envelope,operationId:'parent',observedSequence:1,action:'invalid-parent',expected:0.005,value:0},
    {...envelope,operationId:'stale',observedSequence:0,expected:0.005,value:0.004},
    {...envelope,operationId:'nan',observedSequence:1,expected:0.005,value:null},
    {...envelope,operationId:'unknown',observedSequence:1,action:'snapshot',expected:0.005,value:0},
    {...envelope,operationId:'other',projectId:'project-c'},
    {...envelope,operationId:'version',protocol:2}
  ];
  for (const input of badCases) { const response = await post('command',input); assert.ok(response.status>=400,JSON.stringify(input)); }
  assert.deepEqual(await (await post('state',{projectId:'project-a'})).json(),accepted);
  const move = await post('command',{...envelope,operationId:'move',observedSequence:1,action:'move',expected:0.005,value:1});
  assert.equal(move.status,200); const moved = await move.json();
  assert.equal(moved.childCount,1); assert.equal(moved.secondStageChildCount,1);
  assert.equal(moved.automatic.parent,'component-2/10000002');
  const b1 = await post('command',{...envelope,projectId:'project-b',operationId:'b1',value:0.01}); assert.equal(b1.status,200);
  assert.deepEqual(await (await post('state',{projectId:'project-a'})).json(),moved);
  assert.equal((await mf.dispatchFetch('http://proof/command',{method:'POST',body:'x'.repeat(2049)})).status,413);
  const report = {runtime:'Miniflare/workerd (versions in lockfile)',startupWallMs,firstCommandWallMs:a1wallMs,artifactBytes:Buffer.byteLength(javascript),invalidInputs:9,projects:2,acceptedCommands:3,duplicateRetries:1,transcript};
  await writeFile(resolve(root,'build/workerd-result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({startupWallMs,firstCommandWallMs:a1wallMs,invalidInputs:9,projects:2,acceptedCommands:3,duplicateRetries:1,artifactBytes:report.artifactBytes}));
} finally { await mf.dispose(); }
