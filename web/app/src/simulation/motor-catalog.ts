import data from './motor-index.json' with { type: 'json' };
import pinned from './motors.json' with { type: 'json' };
import { sha256, type ExpandedArchive } from '@openrocket/ork-format';
export interface CatalogMotor {
  key: string; digest: string; sha256: string; functionalDigest: string; manufacturer: string; manufacturerNames: string[]; designation: string; commonName: string;
  type: string; diameter: number; length: number; caseInfo: string; group: number; filterImpulse: number; available: boolean; similar: string[]; impulse: number; burnTime: number; delays: string[];
}
if (data.sourceSha256 !== pinned.sourceSha256) throw new Error('Browser motor catalog source differs from the pinned database');
export const motors = data.motors as CatalogMotor[];
const loaded = new Map<string, { bytes: Uint8Array; hash: string }>();
export function catalogMotor(key: string) {
  const motor = motors.find(m => m.key === key);
  if (!motor) throw new Error('Unknown catalog motor');
  return motor;
}
export async function loadMotorCurve(motor: CatalogMotor, fetchCurve: typeof fetch = fetch) {
  const response = await fetchCurve(`/motors/${motor.sha256}.rse`);
  if (!response.ok) throw new Error(`Motor curve unavailable (${motor.designation}); retry after the catalog assets are available`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await sha256(bytes) !== motor.sha256) throw new Error('Motor catalog curve hash mismatch');
  return bytes;
}
export function cachedMotorCurve(digest: string) { return loaded.get(digest); }
export async function resolveCatalogMotors(archive: ExpandedArchive) {
  for (const ref of archive.parsed.nodes.filter(n => n.name === 'motor' && n.parent?.name === 'motormount')) {
    const get = (key: string) => ref.children.find(n => n.name === key)?.text.trim();
    const digest = get('digest') ?? '';
    if (Object.hasOwn(pinned.motors, digest) || loaded.has(digest) || archive.entries.some(e => e.path === `thrustcurves/${digest}.rse`)) continue;
    const motor = motors.find(m => m.digest === digest && m.designation === get('designation') && m.diameter === Number(get('diameter')) && m.length === Number(get('length')));
    if (motor) loaded.set(digest, { bytes: await loadMotorCurve(motor), hash: motor.sha256 });
  }
}
