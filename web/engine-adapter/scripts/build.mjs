import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname,'..');
const repo = resolve(root,'../..');
const baseline = '33bdb6d3062a6d9ef44a00d1ff865f962136e9e9';
function run(command,args) {
  const result = spawnSync(command,args,{cwd:repo,stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
run('git',['diff','--exit-code',baseline,'--','core/src/main/java']);
run('./gradlew',[':core:g1EngineClasspath','-I',resolve(root,'classpath.gradle'),'--no-daemon']);
run('./gradlew',['-p',root,'generateJavaScript','reference','adaptedReference','--no-daemon']);
run('./gradlew',['-p',root,'generateJavaScript','-Preducer','--no-daemon']);
const transcript = async path=>(await readFile(resolve(root,path),'utf8')).split('\n').filter(line=>line.startsWith('{')).map(JSON.parse);
assert.deepEqual(await transcript('build/adapted-reference.jsonl'),await transcript('build/reference.jsonl'),'API-adapted JVM differs from original JVM fixture');
const sha256 = data=>createHash('sha256').update(data).digest('hex');
const sourceHash = spawnSync('git',['ls-tree','-r',baseline,'core/src/main/java'],{cwd:repo,encoding:'utf8'});
if (sourceHash.status !== 0) throw new Error('cannot identify pinned Java source tree');
const files = [
  'build/generated/teavm/js/openrocket-g1-engine.js','build/generated/teavm/js/reducer.js',
  'src/main/java/proof/FlightProof.java','src/main/java/proof/EditingProof.java',
  'build.gradle','src/main/java/info/openrocket/core/preferences/ApplicationPreferences.java'
];
async function javaSources(directory) {
  const found=[];
  for (const entry of await readdir(resolve(root,directory),{withFileTypes:true})) {
    const path=directory+'/'+entry.name;
    if(entry.isDirectory()) found.push(...await javaSources(path));
    else if(entry.name.endsWith('.java')) found.push(path);
  }
  return found.sort();
}
files.push(...await javaSources('src/main/java'),'classpath.gradle','scripts/build.mjs','scripts/browser.mjs','scripts/workerd.mjs');
const hashes = {};
for (const path of files) { const bytes = await readFile(resolve(root,path)); hashes[path]={sha256:sha256(bytes),bytes:bytes.length}; }
const catalogs = {};
for (const path of ['core/src/main/resources/datafiles/thrustcurves/initial_motors.db','core/src/main/java/info/openrocket/core/database/Databases.java']) {
  const bytes = await readFile(resolve(repo,path)); catalogs[path]={sha256:sha256(bytes),usedByProof:false};
}
const manifest = {adaptedJvmExact:true,sourceRevision:baseline,sourceTreeListingSha256:sha256(sourceHash.stdout),teavm:'0.15.0',java:'17',catalogPolicy:'Explicit synthetic curve and explicit fixture materials; desktop catalogs are not loaded',catalogs,hashes};
await writeFile(resolve(root,'build/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
