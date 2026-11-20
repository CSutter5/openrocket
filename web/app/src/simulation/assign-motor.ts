import { exportArchive, importArchive, sha256, type ExpandedArchive } from '@openrocket/ork-format';
import { replaceSpans, simulationStatusChanges } from '../../../packages/ork-format/src/radius.js';
import { catalogMotor, loadMotorCurve } from './motor-catalog.ts';
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export async function assignMotor(archive: ExpandedArchive, configurationId: string, mountId: string, key: string, delay: string) {
  if (archive.mode !== 'editable') throw new Error('Preservation-only archives cannot change motors');
  if (!archive.parsed.components[0]?.children.some(n => n.name === 'motorconfiguration' && n.attributes.configid?.value === configurationId)) throw new Error('Unknown motor configuration');
  const component = archive.parsed.components.find(n => n.id === mountId), mounts = component?.children.filter(n => n.name === 'motormount') ?? [];
  if (mounts.length !== 1 || !['bodytube', 'innertube'].includes(component!.name)) throw new Error('Select an existing body or inner tube motor mount');
  const motor = catalogMotor(key);
  if (!['single', 'reload', 'hybrid'].includes(motor.type)) throw new Error('This catalog curve has no supported motor type');
  if (delay !== 'none' && (!delay.trim() || !Number.isFinite(Number(delay)) || Number(delay) < 0 || Number(delay) > 1000)) throw new Error('Ejection delay must be 0–1000 seconds or none');
  const mount = mounts[0], refs = mount.children.filter(n => n.name === 'motor' && n.attributes.configid?.value === configurationId);
  if (refs.length > 1) throw new Error('Ambiguous motor assignment');
  const fields: Record<string, string> = { type: motor.type, manufacturer: motor.manufacturer, digest: motor.digest, designation: motor.designation, diameter: String(motor.diameter), length: String(motor.length), delay };
  const replacements: { start: number; end: number; text: string }[] = [];
  if (refs.length) {
    const ref = refs[0];
    if (Object.keys(ref.attributes).join(',') !== 'configid' || ref.children.length !== 7 || new Set(ref.children.map(n => n.name)).size !== 7) throw new Error('Unsupported motor assignment fields');
    for (const n of ref.children) {
      const value = fields[n.name];
      if (value === undefined || n.children.length || Object.keys(n.attributes).length) throw new Error('Unsupported motor assignment field');
      const same = ['diameter', 'length'].includes(n.name) || n.name === 'delay' && value !== 'none' ? Number(n.text.trim()) === Number(value) : n.text.trim() === value;
      if (!same) replacements.push({ start: n.contentStart, end: n.contentEnd, text: escape(value) });
    }
    if (!replacements.length) return archive;
  } else {
    if (mount.selfClosing) throw new Error('Incomplete motor mount settings');
    replacements.push({ start: mount.contentEnd, end: mount.contentEnd, text: `<motor configid="${escape(configurationId)}">` + Object.entries(fields).map(([name, value]) => `<${name}>${escape(value)}</${name}>`).join('') + '</motor>' });
  }
  const bytes = await loadMotorCurve(motor), path = `thrustcurves/${motor.digest}.rse`;
  const existing = archive.entries.find(e => e.path === path);
  if (existing && existing.sha256 !== motor.sha256) {
    for (const ref of archive.parsed.nodes.filter(n => n.name === 'motor' && n.parent?.name === 'motormount' && !refs.includes(n))) {
      if (ref.children.find(n => n.name === 'digest')?.text.trim() !== motor.digest) continue;
      if (['manufacturer', 'designation', 'type', 'diameter', 'length'].some(name => { const value = ref.children.find(n => n.name === name)?.text.trim(); return ['diameter', 'length'].includes(name) ? Number(value) !== Number(fields[name]) : value !== fields[name]; })) throw new Error('This curve conflicts with another configuration using the same digest; its existing motor data is retained');
    }
  }
  replacements.push(...simulationStatusChanges(archive, n => n.children.find(c => c.name === 'conditions')?.children.find(c => c.name === 'configid')?.text.trim() === configurationId).map(c => ({ start: c.start, end: c.end, text: c.after })));
  const updated = await replaceSpans(archive, replacements);
  const entries = updated.entries.filter(e => e.path !== path);
  entries.push({ path, bytes, sha256: await sha256(bytes) });
  const exported = await exportArchive({ ...updated, entries, changed: true });
  const accepted = await importArchive(exported.bytes, exported.identity);
  if (accepted.mode !== 'editable') throw new Error('Motor assignment could not be safely reopened');
  return { ...accepted, original: archive.original.slice(), changed: true };
}
