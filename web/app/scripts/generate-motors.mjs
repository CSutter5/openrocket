import { readFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, delimiter } from 'node:path';
const root = resolve(import.meta.dirname, '../../..'), build = resolve(root, 'web/app/build/motor-catalog');
await mkdir(build, { recursive: true });
await rm(resolve(root, 'web/app/public/motors'), { recursive: true, force: true });
const classpath = (await readFile(resolve(root, 'web/engine-adapter/build/reference-classpath.txt'), 'utf8')).trim();
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed to generate the bundled motor catalog`);
}
run('javac', ['-cp', classpath, '-d', build, resolve(import.meta.dirname, 'MotorCatalogExporter.java')]);
run('java', ['-cp', build + delimiter + classpath, 'MotorCatalogExporter',
  resolve(root, 'core/src/main/resources/datafiles/thrustcurves/initial_motors.db'),
  resolve(root, 'web/app/src/simulation/motor-index.json'), resolve(root, 'web/app/public/motors')]);
