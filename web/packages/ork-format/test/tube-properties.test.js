import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importArchive, exportArchive} from '../src/index.js';
import {tubePropertyInput, applyTubeProperty} from '../src/tube-properties.js';
const id='10000002-0000-4000-8000-000000000000';
const xml=`<openrocket version="1.11"><rocket><name>Rocket</name><id>10000000-0000-4000-8000-000000000000</id><subcomponents><stage><name>Stage</name><id>10000001-0000-4000-8000-000000000000</id><subcomponents><bodytube><name>Tube</name><id>${id}</id><length>0.3</length><radius>0.03</radius><thickness>0.001</thickness><material type="bulk" note=" density='42'" density = '680' group="Other" shearModulus="0.0">Keep &amp; exact</material><unknown><![CDATA[opaque]]></unknown></bodytube></subcomponents></stage></subcomponents></rocket><simulations><simulation status="loaded"><name>Stored</name><flightdata>untouched</flightdata></simulation></simulations></openrocket>`;
const read=text=>importArchive(new TextEncoder().encode(text));
const state={radius:.03,thickness:.001,automatic:false,preset:false,presetDigest:null,length:.3,density:680,filled:false,innerRadius:.029,volume:.00001,mass:.01,cg:.15,listeners:0};
test('length and wall replace only their span and result status',async()=>{
 for(const [property,value,before,after,effect] of [
  ['length',.5,'<length>0.3</length>','<length>0.5</length>',{...state,length:.5}],
  ['thickness',.002,'<thickness>0.001</thickness>','<thickness>0.002</thickness>',{...state,thickness:.002}],
 ]) {
  const original=await read(xml), input=tubePropertyInput(original,id);
  const edited=await applyTubeProperty(original,input,property,value,effect,true);
  assert.equal(edited.xml,xml.replace(before,after).replace('status="loaded"','status="outdated"'));
  assert.deepEqual(edited.original,original.original);
  assert.deepEqual(edited.identity.simulations,original.identity.simulations);
  assert.equal((await importArchive((await exportArchive(edited)).bytes)).xml,edited.xml);
 }
});
test('no-op keeps exact upload and statuses; stale/invalid effects reject',async()=>{
 const original=await read(xml), input=tubePropertyInput(original,id);
 assert.equal(await applyTubeProperty(original,input,'length',.3,state,false),original);
 await assert.rejects(applyTubeProperty(original,{...input,length:.4},'length',.5,{...state,length:.5},true),{code:'CONFLICT'});
 for(const [p,v] of [['length',0],['thickness',-1],['density',NaN],['unknown',.2]]) await assert.rejects(applyTubeProperty(original,input,p,v,state,true),{code:'INVALID_TUBE_PROPERTY'});
 await assert.rejects(applyTubeProperty(original,input,'length',.5,{...state,length:.5,extra:true},true),{code:'INVALID_TUBE_EFFECTS'});
});
test('automatic dependencies stay read-only and unproven stored status rejects atomically',async()=>{
 const automatic=await read(xml.replace('<radius>0.03</radius>','<radius>auto 0.03</radius>'));
 assert.throws(()=>tubePropertyInput(automatic,id));
 const bad=await read(xml.replace('status="loaded"','status="aborted"')), input=tubePropertyInput(bad,id);
 await assert.rejects(applyTubeProperty(bad,input,'length',.5,{...state,length:.5},true),{code:'UNSUPPORTED_RADIUS_INPUT'});
 assert.equal(bad.xml,xml.replace('status="loaded"','status="aborted"'));
});
