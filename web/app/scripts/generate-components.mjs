import { readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, delimiter } from 'node:path';
const root = resolve(import.meta.dirname, '../../..'), build = resolve(root, 'web/app/build/components');
await mkdir(build, { recursive: true });
const classpath = (await readFile(resolve(root, 'web/engine-adapter/build/reference-classpath.txt'), 'utf8')).trim();
for (const [command, args] of [
  ['javac', ['-cp', classpath, '-d', build, resolve(import.meta.dirname, 'ComponentDefaultsExporter.java')]],
  ['java', ['-Djava.awt.headless=true', `-Djava.util.prefs.userRoot=${build}/preferences`, '-cp', build + delimiter + classpath, 'ComponentDefaultsExporter', resolve(build, 'defaults.json')]],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed to generate component defaults`);
}
