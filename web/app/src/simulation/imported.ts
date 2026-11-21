import { cachedMotorCurve } from './motor-catalog.ts';
import sampleProfile from './profile.json' with {type:'json'};
import catalog from './motors.json' with {type:'json'};
import { SaxesParser } from 'saxes';
import { sha256, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
import { numeric } from '../../../packages/ork-format/src/radius.js';

const common='name id comment axialoffset position overridemass overridesubcomponentsmass overridecg overridesubcomponentscg overridecd overridesubcomponentscd color linestyle appearance';
const shell='finish material length thickness';
const transition='shape shapeclipped shapeparameter foreradius aftradius foreshoulderradius foreshoulderlength foreshoulderthickness foreshouldercapped aftshoulderradius aftshoulderlength aftshoulderthickness aftshouldercapped isflipped';
const mass='packedlength packedradius radialposition radialdirection';
const required:Record<string,string>={
  rocket:'name id axialoffset position designtype referencetype',stage:'name id',
  nosecone:'name id finish material length thickness shape aftradius aftshoulderradius aftshoulderlength aftshoulderthickness aftshouldercapped isflipped',
  transition:'name id finish material length thickness shape foreradius aftradius foreshoulderradius foreshoulderlength foreshoulderthickness foreshouldercapped aftshoulderradius aftshoulderlength aftshoulderthickness aftshouldercapped',
  bodytube:'name id finish material length thickness radius',
  innertube:'name id material length radialposition radialdirection outerradius thickness clusterconfiguration clusterscale clusterrotation',
  trapezoidfinset:'name id fincount rotation axialoffset position finish material thickness crosssection cant filletradius filletmaterial rootchord tipchord sweeplength height',
  masscomponent:`name id ${mass} mass masscomponenttype`,parachute:`name id ${mass} cd material deployevent deployaltitude deploydelay diameter linecount linelength linematerial`,
  shockcord:`name id ${mass} cordlength material`,bulkhead:'name id material length radialposition radialdirection outerradius instancecount instanceseparation',
};
const fields: Record<string,string> = {
  rocket:`${common} designer revision kitname designtype motorconfiguration referencetype customreference`, stage:`${common} separationevent separationaltitude separationdelay separationconfiguration`,
  nosecone:`${common} ${shell} ${transition}`, transition:`${common} ${shell} ${transition}`,
  bodytube:`${common} ${shell} radius motormount`,
  innertube:`${common} material length radialposition radialdirection outerradius thickness clusterconfiguration clusterscale clusterrotation motormount`,
  trapezoidfinset:`${common} finish material thickness instancecount fincount radiusoffset angleoffset rotation crosssection cant filletradius filletmaterial rootchord tipchord sweeplength height tabheight tablength tabposition`,
  masscomponent:`${common} ${mass} mass masscomponenttype`,
  parachute:`${common} ${mass} preset cd material deployevent deployaltitude deploydelay deploymentconfiguration diameter linecount linelength linematerial isdrogue`,
  bulkhead:`${common} material length radialposition radialdirection outerradius instancecount instanceseparation`,
  shockcord:`${common} ${mass} cordlength material`,
};
export const importedPreset = {type:'PARACHUTE',manufacturer:'Top Flight Recovery',partno:'PAR-36',digest:'3712e18a34970eb9fdfd4e170ffabc6d'};
const attr = (n: XmlNode,key:string) => n.attributes[key]?.value;
const one = (n: XmlNode,key:string) => { const all=n.children.filter(c=>c.name===key); if(all.length!==1)throw new Error(`Expected one ${n.name}/${key}`);return all[0]; };
function attributes(n:XmlNode, allowed:string[]) { if(Object.keys(n.attributes).some(k=>!allowed.includes(k)))throw new Error(`Unsupported ${n.name} attributes`); }
function scalar(n:XmlNode) { if(n.children.length)throw new Error(`Unsupported nested ${n.name}`); }
const separationEvents = new Set('launch ignition burnout ejection upperignition altitudeascending apogee altitudedescending never'.split(' '));
const ignitionEvents = new Set('automatic launch ejectioncharge burnout never'.split(' '));
const encode=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\t/g,'\\t').replace(/\r/g,'\\r').replace(/\n/g,'\\n');
export function importedInput(archive: ExpandedArchive, requestedConfigurationId?: string, analysis = false) {
  if(archive.mode!=='editable'||archive.parsed.version!=='1.11')throw new Error('Requires an editable format 1.11 archive');
  const nodes=archive.parsed.components;
  const stages = nodes.filter(n => n.name === 'stage');
  if(nodes.length>64||nodes[0]?.name!=='rocket'||!stages.length||stages.some(n=>n.parent?.parent!==nodes[0]))throw new Error('Requires direct axial stages and at most 64 components');
  const root=archive.parsed.nodes.find(n=>n.name==='openrocket')!;
  attributes(root,['version','creator']);
  for(const c of root.children)if(c.name!=='rocket'){
    attributes(c,[]);
    if(c.name==='docprefs') {
      const seen=new Set<string>();
      for(const pref of c.children) {
        if(pref.name==='docmaterials')continue;
        attributes(pref,['key','type']);scalar(pref);
        const key=attr(pref,'key');
        if(pref.name!=='pref'||key!=='simulation.table.hiddenColumns'||attr(pref,'type')!=='string'||seen.has(key))throw new Error('Unsupported document preferences');
        seen.add(key);
      }
    }
  }
  for(const n of root.children)if(!['rocket','simulations','datatypes','photostudio','docprefs'].includes(n.name))throw new Error(`Unsupported document field ${n.name}`);
  // Historical series/expressions are preserved data. They do not initialize a new run.
  if(archive.parsed.nodes.some(n=>/^(extension|listener|script|simulationextension)$/i.test(n.name)))throw new Error('Imported simulation extensions/scripts are unsupported');
  for(const simulation of archive.parsed.simulations) {
    if(simulation.children.some(n=>!['name','simulator','calculator','conditions','flightdata','landingdispersion'].includes(n.name)))throw new Error('Unsupported imported simulation behavior');
    const dispersion=simulation.children.filter(n=>n.name==='landingdispersion');
    if(dispersion.length>1)throw new Error('Ambiguous landing-dispersion settings');
    for(const settings of dispersion) {
      // A separate analysis setup, preserved without affecting the nominal flight.
      attributes(settings,['runs','seed']);
      const runs=numeric(attr(settings,'runs')??'','dispersion runs'),seed=numeric(attr(settings,'seed')??'','dispersion seed');
      if(settings.text.trim()||!Number.isInteger(runs)||runs<2||runs>100000||!Number.isInteger(seed)||seed< -2147483648||seed>2147483647)throw new Error('Invalid landing-dispersion settings');
      const relative='airdensity totalmass axialdrag normalforce thrust recoverydrag'.split(' '),parameters=[...relative,...'windspeed winddirection launchguideangle launchguidedirection cgaxial ignitiondelay deploymentdelay'.split(' ')],seen=new Set<string>();
      for(const uncertainty of settings.children) {
        attributes(uncertainty,['parameter','distribution','spread']);scalar(uncertainty);
        const parameter=attr(uncertainty,'parameter')??'',distribution=attr(uncertainty,'distribution');
        if(uncertainty.name!=='uncertainty'||uncertainty.text.trim()||!parameters.includes(parameter)||seen.has(parameter)||!['normal','uniform','lognormal'].includes(distribution??'')||distribution==='lognormal'&&!relative.includes(parameter)||numeric(attr(uncertainty,'spread')??'','dispersion spread')<0)throw new Error('Unsupported landing-dispersion uncertainty');
        seen.add(parameter);
      }
    }
    if(simulation.children.find(n=>n.name==='simulator')?.text.trim()!=='RK4Simulator')throw new Error('Unsupported imported simulator');
    if(simulation.children.find(n=>n.name==='calculator')?.text.trim()!=='BarrowmanCalculator')throw new Error('Unsupported imported aerodynamic calculator');
  }
  const configurations=nodes[0].children.filter(n=>n.name==='motorconfiguration');
  if((!analysis && configurations.length<1)||configurations.length>16)throw new Error('Requires 1–16 defined configurations');
  const ids=configurations.map(n=>attr(n,'configid'));
  if(ids.some(id=>!id||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))||new Set(ids).size!==ids.length)throw new Error('Ambiguous configuration IDs');
  const selected=configurations.filter(n=>attr(n,'default')==='true');if((configurations.length || !analysis) && selected.length!==1)throw new Error('Requires an explicit default flight configuration');
  const configurationId=requestedConfigurationId ?? (selected[0] ? attr(selected[0],'configid')! : '00000000-0000-0000-0000-000000000000');
  if((configurations.length || !analysis) && !ids.includes(configurationId))throw new Error('Unknown selected flight configuration');
  const rows=['imported-flight-v1',`configuration\t${configurationId}`,`count\t${nodes.length}`];
  const materials:unknown[]=[],curves=new Map<string,{bytes:Uint8Array;hash:string}>();let mounts=0,recovery=0;const selectedMotors:string[]=[];const catalogReferences:string[]=[];
  function add(n:XmlNode,path:string) {
    if(n.name==='separationevent'&&!separationEvents.has(n.text.trim()))throw new Error('Unsupported separation event');
    if(n.name==='ignitionevent'&&!ignitionEvents.has(n.text.trim()))throw new Error('Unsupported ignition event');
    rows.push(`${path}\t${encode(n.text.trim())}`);
    for(const [key,v] of Object.entries(n.attributes))rows.push(`${path}/@${key}\t${encode(v.value)}`);
  }
  const finFields = `${common} finish material thickness instancecount fincount radiusoffset angleoffset rotation crosssection cant filletradius filletmaterial tabheight tablength tabposition`;
  const additionalFields: Record<string, string> = {
    freeformfinset: `${finFields} finpoints`,
    ellipticalfinset: `${finFields} rootchord height`,
    tubefinset: `${common} finish material instancecount fincount radiusoffset angleoffset rotation radius length thickness`,
    launchlug: `${common} finish material instancecount instanceseparation angleoffset radialdirection radius length thickness`,
    railbutton: `${common} preset finish material instancecount instanceseparation angleoffset outerdiameter innerdiameter height baseheight flangeheight screwheight`,
    streamer: `${common} ${mass} cd material deployevent deployaltitude deploydelay deploymentconfiguration striplength stripwidth`,
    centeringring: `${common} material length radialposition radialdirection outerradius innerradius instancecount instanceseparation`,
    tubecoupler: `${common} material length radialposition radialdirection outerradius thickness`,
    engineblock: `${common} material length radialposition radialdirection outerradius thickness`,
  };
  nodes.forEach((n,i)=>{
    const allowed = fields[n.name] ?? additionalFields[n.name];
    if(!allowed)throw new Error(`Unsupported component ${n.name}`);
    const parent=nodes.indexOf(n.parent?.parent!);if(i>0&&(parent<0||parent>=i))throw new Error('Invalid component parent');
    const positions=n.children.filter(c=>['axialoffset','position'].includes(c.name));
    if(positions.length===2&&(attr(positions[0],'method')??attr(positions[0],'type'))!==(attr(positions[1],'method')??attr(positions[1],'type')))throw new Error('Ambiguous axial position methods');
    if(positions.length===2&&numeric(positions[0].text.trim(),'position')!==numeric(positions[1].text.trim(),'position'))throw new Error('Ambiguous axial offsets');
    attributes(n,[]);rows.push(`${i}/type\t${n.name}`,`${i}/parent\t${parent}`);
    const seen=new Set<string>();
    for(const c of n.children) {
      if(c.name==='subcomponents')continue;
      if(!allowed.split(' ').includes(c.name))throw new Error(`Unsupported ${n.name}/${c.name}`);
      const repeated=['motorconfiguration','deploymentconfiguration','separationconfiguration','tabposition'].includes(c.name);
      if(c.name==='tabposition') {
        const methods:Record<string,string>={front:'top',center:'middle',end:'bottom',top:'top',middle:'middle',bottom:'bottom'};
        const tabs=n.children.filter(v=>v.name==='tabposition');
        if(tabs.length>2||tabs.some(v=>!methods[attr(v,'relativeto')!]||methods[attr(v,'relativeto')!]!==methods[attr(c,'relativeto')!]||numeric(v.text.trim(),'tab position')!==numeric(c.text.trim(),'tab position')))throw new Error('Ambiguous fin tab position');
        if(seen.has(c.name))continue;
      }
      if (n.name === 'tubefinset' && ['fincount', 'rotation'].includes(c.name) && seen.has(c.name)) {
        if (n.children.filter(other => other.name === c.name).some(other => other.text.trim() !== c.text.trim())) throw new Error('Ambiguous tube-fin geometry');
        continue;
      }
      if(seen.has(c.name)&&!repeated)throw new Error(`Ambiguous ${n.name}/${c.name}`);seen.add(c.name);
      if(c.name==='appearance')continue; // Visual metadata never affects rigid-body flight.
      if(c.name==='preset'&&n.name==='parachute'&&Object.entries(importedPreset).some(([k,v])=>attr(c,k)!==v)) {
        attributes(c,['type','manufacturer','partno','digest']);scalar(c);
        if(c.text.trim()||attr(c,'type')!=='PARACHUTE'||!attr(c,'manufacturer')?.trim()||!attr(c,'partno')?.trim()||!/^[a-f0-9]{1,32}$/i.test(attr(c,'digest')??''))throw new Error('Invalid parachute preset reference');
        for(const name of 'packedlength packedradius cd material diameter linecount linelength linematerial'.split(' ')) {
          if(one(n,name).start<c.end)throw new Error('Parachute physical fields must follow the preset reference');
        }
        for(const pair of [['overridemass','overridesubcomponentsmass'],['overridecg','overridesubcomponentscg'],['overridecd','overridesubcomponentscd']]) {
          if(n.children.some(field=>pair.includes(field.name)))for(const name of pair)one(n,name);
        }
        if(n.children.some(field=>['overridemass','overridesubcomponentsmass','overridecg','overridesubcomponentscg','overridecd','overridesubcomponentscd'].includes(field.name)&&field.start<c.end))throw new Error('Parachute overrides must follow the preset reference');
        continue;
      }
      if(c.name==='preset'&&n.name==='railbutton') {
        attributes(c,['type','manufacturer','partno','digest']);scalar(c);
        if(c.text.trim()||attr(c,'type')!=='RAIL_BUTTON'||!attr(c,'manufacturer')?.trim()||!attr(c,'partno')?.trim()||!/^[a-f0-9]{32}$/i.test(attr(c,'digest')??''))throw new Error('Invalid rail-button preset reference');
        // The archive supplies the complete physical state; retain the library link only in the archive.
        for(const name of 'finish material outerdiameter innerdiameter height baseheight flangeheight screwheight overridemass overridesubcomponentsmass'.split(' ')) {
          if(one(n,name).start<c.end)throw new Error('Rail-button physical fields must follow the preset reference');
        }
        if(n.children.some(field=>['overridecd','overridesubcomponentscd'].includes(field.name)&&field.start<c.end))throw new Error('Rail-button drag overrides must follow the preset reference');
        continue;
      }
      if(c.name==='motorconfiguration') {
        attributes(c,['configid','default']);
        if(c.children.some(n=>!['name','stage'].includes(n.name))||c.children.filter(n=>n.name==='name').length>1)throw new Error('Unknown or ambiguous configuration field');
        const flags=c.children.filter(n=>n.name==='stage'), numbers=new Set<number>();
        if(flags.length!==stages.length)throw new Error('Requires one active flag per axial stage');
        for(const stage of flags) {
          const number=Number(attr(stage,'number'));
          if(!/^\d+$/.test(attr(stage,'number')??'')||number>=stages.length||numbers.has(number)||!['true','false'].includes(attr(stage,'active')!))throw new Error('Invalid or ambiguous stage configuration');
          attributes(stage,['number','active']);if(stage.children.length||stage.text.trim())throw new Error('Unknown stage configuration behavior');
          numbers.add(number);rows.push(`stageActive/${attr(c,'configid')}/${number}\t${attr(stage,'active')}`);
        }
        if(!flags.some(n=>attr(n,'active')==='true'))throw new Error('Requires at least one active stage');
        const name=c.children.find(n=>n.name==='name');
        if(name){attributes(name,[]);scalar(name);if(name.text.trim())rows.push(`configurationName/${attr(c,'configid')}\t${encode(name.text)}`);}
        rows.push(`config/${attr(c,'configid')}\t${attr(c,'default')==='true'}`);continue;
      }
      if(c.name==='motormount') {
        attributes(c,[]);mounts++;
        for(const key of ['overhang','ignitionevent','ignitiondelay'])one(c,key);
        for(const m of c.children) {
          if(!['ignitionevent','ignitiondelay','overhang','motor','ignitionconfiguration'].includes(m.name))throw new Error(`Unsupported motor field ${m.name}`);
          if(m.name==='motor'||m.name==='ignitionconfiguration') {
            attributes(m,['configid']);const id=attr(m,'configid')!;if(!ids.includes(id))throw new Error('Unresolved motor configuration');
            const keys=m.name==='motor'?['type','manufacturer','digest','designation','diameter','length','delay']:['ignitionevent','ignitiondelay'];
            const optional=m.name==='motor'?['nozzleexitdiameter']:[];
            if(keys.some(key=>m.children.filter(c=>c.name===key).length!==1)||new Set(m.children.map(c=>c.name)).size!==m.children.length)throw new Error('Incomplete motor/ignition configuration');
            for(const v of m.children){if(!keys.includes(v.name)&&!optional.includes(v.name))throw new Error(`Unknown motor ${v.name}`);attributes(v,[]);scalar(v);if(v.name==='nozzleexitdiameter'){const diameter=numeric(v.text.trim(),'nozzle exit diameter');if(diameter<0||diameter>numeric(one(m,'diameter').text.trim(),'motor diameter'))throw new Error('Nozzle exit diameter must be between zero and motor diameter');}add(v,`${i}/motormount/${m.name}/${id}/${v.name}`);}
            if(m.name==='motor') {
              const digest=one(m,'digest').text.trim();if(!/^[a-f0-9]{32}$/.test(digest))throw new Error('Invalid motor digest');
              const pinned=(catalog.motors as Record<string,{rse:string;sha256:string}>)[digest];
              const entry=archive.entries.find(e=>e.path===`thrustcurves/${digest}.rse`);
              if(pinned){curves.set(digest,{bytes:new TextEncoder().encode(pinned.rse),hash:pinned.sha256});catalogReferences.push(digest);}
              else if(cachedMotorCurve(digest)){curves.set(digest,cachedMotorCurve(digest)!);catalogReferences.push(digest);}
              else if(entry&&digest===sampleProfile.motor.digest&&entry.sha256!==sampleProfile.motor.sha256)throw new Error('Changed synthetic motor curve');
              else if(entry)curves.set(digest,{bytes:entry.bytes,hash:entry.sha256});
              else throw new Error('Missing embedded or available catalog motor curve');
              if(id===configurationId) {
                let stage:XmlNode|undefined=n;while(stage&&stage.name!=='stage')stage=stage.parent;
                const flag=configurations.find(c=>attr(c,'configid')===id)?.children.find(c=>c.name==='stage'&&Number(attr(c,'number'))===stages.indexOf(stage!));
                if(attr(flag!,'active')==='true')selectedMotors.push(one(m,'designation').text.trim());
              }
            }
          } else {attributes(m,[]);scalar(m);add(m,`${i}/motormount/${m.name}`);}
        }
        continue;
      }
      if(c.name==='separationconfiguration') {
        attributes(c,['configid']);const id=attr(c,'configid')!;if(!ids.includes(id))throw new Error('Unresolved separation configuration');
        const keys=['separationevent','separationaltitude','separationdelay'];
        if(c.children.length!==3||new Set(c.children.map(n=>n.name)).size!==3)throw new Error('Incomplete separation configuration');
        for(const v of c.children){if(!keys.includes(v.name))throw new Error('Unknown separation field');attributes(v,[]);scalar(v);if(v.name!=='separationevent')numeric(v.text.trim(),v.name);add(v,`${i}/separationconfiguration/${id}/${v.name}`);}continue;
      }
      if(c.name==='finpoints') {
        attributes(c,[]);if(c.children.length<3||c.children.length>64||c.text.trim())throw new Error('Requires 3–64 fin points');
        c.children.forEach((point,j)=>{if(point.name!=='point'||point.children.length||point.text.trim())throw new Error('Unsupported fin point');attributes(point,['x','y']);for(const axis of ['x','y']){numeric(attr(point,axis)??'','fin point');rows.push(`${i}/finpoints/${j}/${axis}\t${attr(point,axis)}`);}});
        rows.push(`${i}/finpoints/count\t${c.children.length}`);continue;
      }
      if(c.name==='deploymentconfiguration') {
        attributes(c,['configid']);const id=attr(c,'configid')!;if(!ids.includes(id))throw new Error('Unresolved recovery configuration');
        if(c.children.length!==3||new Set(c.children.map(c=>c.name)).size!==3)throw new Error('Incomplete recovery configuration');
        for(const v of c.children){if(!['deployevent','deployaltitude','deploydelay'].includes(v.name))throw new Error('Unknown recovery field');attributes(v,[]);scalar(v);add(v,`${i}/deploymentconfiguration/${id}/${v.name}`);}continue;
      }
      if(['material','filletmaterial','linematerial'].includes(c.name)) {attributes(c,['type','density','shearModulus','group']);numeric(attr(c,'density')??'',c.name);materials.push([c.text,c.attributes]);}
      else if(c.name==='preset') {attributes(c,Object.keys(importedPreset));if(Object.entries(importedPreset).some(([k,v])=>attr(c,k)!==v))throw new Error('Unresolved preset digest');}
      else attributes(c,['axialoffset','radiusoffset','angleoffset'].includes(c.name)?['method']:c.name==='position'?['type']:c.name==='tabposition'?['relativeto']:[]);
      scalar(c);
      const tokens=new Set('name id comment designer revision kitname color linestyle designtype referencetype finish shape crosssection masscomponenttype clusterconfiguration deployevent separationevent preset material linematerial filletmaterial'.split(' '));
      const flags=new Set('shapeclipped isflipped aftshouldercapped foreshouldercapped overridesubcomponentsmass overridesubcomponentscg overridesubcomponentscd isdrogue'.split(' '));
      if(flags.has(c.name)){if(!['true','false'].includes(c.text.trim()))throw new Error(`Invalid ${c.name}`);}
      else if(!tokens.has(c.name)){
        const v=c.text.trim();if(!['auto','filled'].includes(v))numeric(v.replace(/^auto /,''),c.name);
      }
      if(['instancecount','fincount','linecount'].includes(c.name)) {
        const maximum=c.name==='linecount'?64:8;
        if(!/^\d+$/.test(c.text.trim())||Number(c.text.trim())>(maximum)||Number(c.text.trim())<(c.name==='linecount'?0:1))throw new Error(`Unsupported integer ${c.name}`);
      }
      add(c,`${i}/${c.name}`);
    }
    if (!analysis) for(const name of (required[n.name] ?? 'name id').split(' '))one(n,name);
    one(n, 'name');one(n, 'id');
    if(n.name==='freeformfinset')one(n,'finpoints');
    if (!['rocket', 'stage', 'masscomponent'].includes(n.name)) one(n, 'material');
    if (n.name === 'parachute') one(n, 'linematerial');
    if (n.children.some(c => c.name === 'filletradius' && numeric(c.text.trim(), 'fillet radius') > 0)) one(n, 'filletmaterial');
    if(!analysis && ['nosecone','transition'].includes(n.name)) {
      const shape=one(n,'shape').text.trim();
      if(!['conical','ogive','ellipsoid','power','parabolic','haack'].includes(shape))throw new Error('Unsupported shell shape');
      if(!['conical','ellipsoid'].includes(shape))one(n,'shapeparameter');
      if(['ellipsoid','power','haack'].includes(shape))one(n,'shapeclipped');
    }
    if(n.name==='innertube'&&n.children.some(c=>c.name==='clusterconfiguration')&&one(n,'clusterconfiguration').text.trim()!=='single')throw new Error('Motor clusters are unsupported');
    if(n.name==='parachute')recovery++;
  });
  if(!analysis && (!mounts||!selectedMotors.length))throw new Error('Requires a resolved motor in an active stage');
  const keys = new Set<string>();
  for(const row of rows) {const key=row.split('\t')[0];if(keys.has(key))throw new Error('Ambiguous simulation field '+key);keys.add(key);}
  const motorHashes:string[]=[];
  for(const [digest,curve] of curves) {
    const text=new TextDecoder('utf-8',{fatal:true}).decode(curve.bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Motor entities are forbidden');
    const parser=new SaxesParser({xmlns:false});let count=0,engines=0,points=0,dataSections=0,lists=0;const stack:string[]=[];
    parser.on('error',e=>{throw e;});parser.on('opentag',tag=>{
      if(++count>10000||stack.length>=8)throw new Error('Motor curve exceeds limit');
      const parents:Record<string,string|undefined>={'engine-database':undefined,'engine-list':'engine-database',engine:'engine-list',comments:'engine',data:'engine','eng-data':'data'};
      if(!Object.hasOwn(parents,tag.name)||parents[tag.name]!==stack.at(-1))throw new Error('Unsupported motor XML structure');
      if(tag.name==='data'&&++dataSections>1||tag.name==='engine-list'&&++lists>1)throw new Error('Ambiguous motor data sections');
      if(!['engine','eng-data'].includes(tag.name)&&Object.keys(tag.attributes).length)throw new Error('Unknown motor container attributes');
      stack.push(tag.name);
      if(tag.name==='engine'){if(Object.keys(tag.attributes).some(k=>!['mfg','code','Type','dia','len','initWt','propWt','delays','auto-calc-mass','auto-calc-cg'].includes(k)))throw new Error('Unknown motor header attributes');engines++;for(const [k,v] of Object.entries(tag.attributes))rows.push(`curve/${digest}/@${k}\t${encode(String(v))}`);}
      else if(tag.name==='eng-data'){if(Object.keys(tag.attributes).some(k=>!['t','f','m','cg'].includes(k)))throw new Error('Unknown motor sample attributes');for(const key of ['t','f','m','cg']){const v=String(tag.attributes[key]??'');numeric(v,'motor '+key);rows.push(`curve/${digest}/${points}/${key}\t${v}`);}points++;}
      else if(!['engine-database','engine-list','comments','data'].includes(tag.name))throw new Error(`Unknown motor field ${tag.name}`);
    });parser.on('closetag',()=>{stack.pop();});parser.on('text',value=>{if(stack.at(-1)!=='comments'&&value.trim())throw new Error('Unexpected motor text');});parser.write(text).close();if(engines!==1||points<2||points>4096)throw new Error('Requires one explicit motor curve');
    rows.push(`curve/${digest}/count\t${points}`);motorHashes.push(curve.hash);
  }
  return {model:rows.join('\n'),configurationId,catalogReferences:[...new Set(catalogReferences)],motorHashes,materials,motor:selectedMotors.join(' + '),recovery:`${recovery} parachute(s), using archived deployment settings`,kind:'imported' as const,maxTime:600};
}
export async function resolvedImportedInput(archive:ExpandedArchive, configurationId?:string) {
  const input=importedInput(archive,configurationId),hash=(value:unknown)=>sha256(new TextEncoder().encode(JSON.stringify(value)));
  return {...input,motorHash:await hash(input.motorHashes),materialsHash:await hash(input.materials)};
}
