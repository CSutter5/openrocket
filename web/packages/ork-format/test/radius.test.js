import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTubeRadius, tubeRadiusInput, radiusSimulationEffects } from '../src/radius.js';
import { exportArchive, importArchive } from '../src/index.js';
const id = '86efa171-d8e6-453e-9541-a3163df01931';
const encode = new TextEncoder();
const xml = `<openrocket version="1.11"><rocket><name>Rocket</name><id>11111111-1111-1111-1111-111111111111</id><subcomponents><bodytube><name>Tube</name><id>${id}</id><overridemass>0.59817493741</overridemass><material type="bulk" density="1850.0">Fiberglass</material><length>0.7619999999999998</length><thickness>0.0011429999999999982</thickness><radius>0.0284734</radius><unknown>preserved</unknown></bodytube></subcomponents></rocket><simulations><simulation status="outdated"><name>Stored</name><flightdata>opaque</flightdata></simulation></simulations></openrocket>`;
const archive = text => importArchive(encode.encode(text));
const effect = {radius:0.03,thickness:0.0011429999999999982,automatic:false,preset:false,mass:0.29793458815144097,cg:0.3809999999999999};
test('projection retains all authoritative intrinsic inputs and applies Java effects to two spans only', async()=>{
  const original=await archive(xml), input=tubeRadiusInput(original,id);
  assert.deepEqual(input,{schema:1,componentId:id,length:0.7619999999999998,radius:0.0284734,thickness:0.0011429999999999982,filled:false,density:1850});
  const changed=await applyTubeRadius(original,input,effect);
  assert.equal(changed.xml,xml.replace('<radius>0.0284734</radius>','<radius>0.03</radius>'));
  assert.deepEqual(changed.original,original.original);
  const exported=await exportArchive(changed), reimported=await importArchive(exported.bytes,exported.identity);
  assert.deepEqual(reimported.identity,exported.identity);
  assert.equal(reimported.parsed.simulations.length,1);
});
test('clamped thickness comes exclusively from accepted Java effects', async()=>{
  const original=await archive(xml), input=tubeRadiusInput(original,id);
  const changed=await applyTubeRadius(original,input,{...effect,radius:0.0005,thickness:0.0005,mass:0.0011071757909413827});
  assert.equal(changed.xml,xml.replace('<radius>0.0284734</radius>','<radius>0.0005</radius>').replace('<thickness>0.0011429999999999982</thickness>','<thickness>0.0005</thickness>'));
});
test('stale full intrinsic input and unrecognized shape reject', async()=>{
  const original=await archive(xml), input=tubeRadiusInput(original,id);
  for(const key of ['schema','length','radius','thickness','density']) await assert.rejects(applyTubeRadius(original,{...input,[key]:input[key]+1},effect),{code:'CONFLICT'});
  await assert.rejects(applyTubeRadius(original,{...input,filled:true},effect),{code:'CONFLICT'});
  await assert.rejects(applyTubeRadius(original,{...input,extra:true},effect),{code:'INVALID_RADIUS_INPUT'});
  for(const effects of [{...effect,radius:NaN},{...effect,automatic:true},{...effect,preset:true},{...effect,extra:true}]) await assert.rejects(applyTubeRadius(original,input,effects),{code:'INVALID_RADIUS_EFFECTS'});
});
test('automatic, preset, ambiguous, malformed, missing and out-of-bound fields reject', async()=>{
  for(const text of [xml.replace('0.0284734</radius>','auto 0.0284734</radius>'),xml.replace('<unknown>','<preset/><unknown>'),
    xml.replace('<radius>0.0284734</radius>','<radius>0.02</radius><radius>0.03</radius>'),xml.replace('0.0284734</radius>','NaN</radius>'),
    xml.replace('<radius>0.0284734</radius>','<radius><!--opaque-->0.03</radius>'),xml.replace('<radius>0.0284734</radius>','<radius><![CDATA[0.03]]></radius>'),
    xml.replace('<length>0.7619999999999998</length>',''),xml.replace('1850.0','50001')]) {
    const imported=await archive(text);
    assert.throws(()=>tubeRadiusInput(imported,id),{code:'UNSUPPORTED_RADIUS_INPUT'});
  }
});
test('filled token remains filled after Java radius edit',async()=>{
  const original=await archive(xml.replace('<thickness>0.0011429999999999982</thickness>','<thickness>filled</thickness>'));
  const input=tubeRadiusInput(original,id); assert.equal(input.filled,true); assert.equal(input.thickness,input.radius);
  const changed=await applyTubeRadius(original,input,{...effect,thickness:0.03});
  assert.ok(changed.xml.includes('<thickness>filled</thickness>'));
});

test('physical changes invalidate current stored results without changing flightdata bytes',async()=>{
  const source=xml.replace('status="outdated"','status = \'uptodate\'');
  const original=await archive(source), input=tubeRadiusInput(original,id);
  assert.deepEqual(radiusSimulationEffects(original,input,effect),[{index:0,before:'uptodate',after:'outdated'}]);
  const changed=await applyTubeRadius(original,input,effect);
  assert.equal(changed.xml,source.replace('<radius>0.0284734</radius>','<radius>0.03</radius>').replace("status = 'uptodate'","status = 'outdated'"));
  assert.equal(changed.parsed.simulations[0].children.find(n=>n.name==='flightdata').text,'opaque');
});
test('no-op retains original XML/status and unproven stored-result status refuses a physical edit',async()=>{
  const source=xml.replace('status="outdated"','status="uptodate"');
  const original=await archive(source), input=tubeRadiusInput(original,id);
  const unchanged={...effect,radius:input.radius,thickness:input.thickness};
  assert.deepEqual(radiusSimulationEffects(original,input,unchanged),[]);
  assert.equal(await applyTubeRadius(original,input,unchanged),original);
  assert.deepEqual((await exportArchive(original)).bytes,encode.encode(source));
  const unproven=await archive(source.replace('status="uptodate"','status="aborted"'));
  await assert.rejects(applyTubeRadius(unproven,input,effect),{code:'UNSUPPORTED_RADIUS_INPUT'});
});

test('status-like text inside an opaque attribute is never rewritten',async()=>{
  const source=xml.replace('status="outdated"',`note=" status='uptodate'" status="uptodate"`);
  const original=await archive(source), input=tubeRadiusInput(original,id);
  const changed=await applyTubeRadius(original,input,effect);
  assert.equal(changed.xml,source.replace('<radius>0.0284734</radius>','<radius>0.03</radius>').replace('status="uptodate"','status="outdated"'));
});
