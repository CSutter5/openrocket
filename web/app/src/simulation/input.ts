import { sha256, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
import { numeric } from '../../../packages/ork-format/src/radius.js';
import profile from './profile.json' with { type: 'json' };

// An explicit desktop-generated capability profile. Every node, attribute and fixed
// field is checked, including fields the exterior drawing deliberately omits.
const body = 'rocket/subcomponents/stage/subcomponents/bodytube';
const variable = new Map([['length', [0, 100]], ['radius', [0, 1]], ['thickness', [0, 1]]]);
export interface FlightInput { model: string; configurationId: string; motorHash: string; materialsHash: string }
export type Support = { supported: true; configurationId: string; motor: string } | { supported: false; reason: string };
function fail(reason: string): never { throw new Error(`Simulation unsupported: ${reason}. The archive can still be viewed, edited where supported, and downloaded.`); }
function records(archive: ExpandedArchive) {
  if (archive.mode !== 'editable' || archive.parsed.version !== '1.11') fail('requires an editable format 1.11 document');
  if (archive.parsed.simulations.length) fail('imported simulation settings/results/extensions are outside this flight profile');
  if (!archive.parsed.nodes.some(n => n.name === 'motormount') || !archive.parsed.components.some(n => n.name === 'parachute')) fail('requires a configured motor mount and parachute; use Open flight-ready sample');
  const root = archive.parsed.nodes.find(n => n.name === 'openrocket')!;
  if (Object.keys(root.attributes).some(key => !['version', 'creator'].includes(key))) fail('unknown root attributes');
  if (root.text.trim() || new Set(root.children.map(n => n.name)).size !== root.children.length) fail('ambiguous document root');
  if (root.children.some(n => !['rocket', 'simulations', 'photostudio', 'docprefs'].includes(n.name) || n.name !== 'rocket' && (n.children.length || n.text.trim() || Object.keys(n.attributes).length))) fail('unknown document settings or extensions');
  const rocket = root.children.filter(n => n.name === 'rocket');
  if (rocket.length !== 1) fail('requires exactly one rocket');
  const result: Record<string, { text: string; attributes: Record<string, string>; children: string[] }> = {};
  function visit(n: XmlNode, path: string) {
    if (Object.hasOwn(result, path)) fail(`duplicate field ${path}`);
    result[path] = { text: n.text.trim(), attributes: Object.fromEntries(Object.entries(n.attributes).map(([key, v]) => [key, v.value])), children: n.children.map(c => c.name) };
    for (const child of n.children) visit(child, path + '/' + child.name);
  }
  visit(rocket[0], 'rocket');
  const expected = profile.records as typeof result;
  const sameNumber = (a: string, b: string) => {
    try { return numeric(a, 'flight field') === numeric(b, 'flight field'); } catch { return false; }
  };
  for (const path of new Set([...Object.keys(expected), ...Object.keys(result)])) {
    const a = result[path], b = expected[path];
    if (!a || !b) fail(`unrepresented field ${path} (including overrides, presets, extensions and extra components)`);
    if (JSON.stringify(a.children) !== JSON.stringify(b.children)) fail(`component/field order differs at ${path}`);
    const keys = Object.keys(a.attributes).sort();
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(b.attributes).sort()) || keys.some(k => a.attributes[k] !== b.attributes[k])) fail(`unsupported attributes at ${path}`);
    if (path.endsWith('/name')) continue;
    const property = path.startsWith(body + '/') ? path.slice(body.length + 1) : '';
    const bounds = variable.get(property);
    if (bounds) {
      const value = numeric(a.text, property);
      if (!a.text || !Number.isFinite(value) || value < bounds[0] || property !== 'thickness' && value === 0 || value > bounds[1]) fail(`explicit ${property} outside supported bounds`);
    } else if (a.text !== b.text && !sameNumber(a.text, b.text)) fail(`unsupported value at ${path}`);
  }
  if (Number(result[body + '/thickness'].text) > Number(result[body + '/radius'].text)) fail('wall exceeds body radius');
  return result;
}
export function flightSupport(archive: ExpandedArchive): Support {
  try {
    records(archive);
    const motor = archive.entries.find(e => e.path === profile.motor.path);
    if (!motor || motor.sha256 !== profile.motor.sha256) fail('missing or changed synthetic motor curve; digest must resolve exactly');
    return { supported: true, configurationId: profile.configurationId, motor: 'C6 synthetic browser proof · synthetic curve, not certified motor data' };
  } catch (error) { return { supported: false, reason: error instanceof Error ? error.message : String(error) }; }
}
export async function flightInput(archive: ExpandedArchive): Promise<FlightInput> {
  const support = flightSupport(archive); if (!support.supported) throw new Error(support.reason);
  const fields = records(archive);
  const encode = (text: string) => text.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const rows: string[] = [];
  for (const [path, value] of Object.entries(fields)) {
    if (!value.children.length) rows.push(`${path}\t${encode(value.text)}`);
    for (const [key, text] of Object.entries(value.attributes)) rows.push(`${path}/@${key}\t${encode(text)}`);
  }
  profile.motor.rows.forEach((row, i) => rows.push(`motor/${i}\t${row.join(',')}`));
  return { model: rows.join('\n'), configurationId: profile.configurationId, motorHash: profile.motor.sha256,
    materialsHash: await sha256(new TextEncoder().encode(JSON.stringify(Object.entries(fields).filter(([key]) => /material(\/|$)/.test(key))))) };
}
