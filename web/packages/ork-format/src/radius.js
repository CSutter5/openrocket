import { exportArchive, importArchive, OrkError } from './index.js';

const encoder = new TextEncoder();
const numberText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const inputKeys = 'componentId,density,filled,length,radius,schema,thickness';
export const PROOF_PRESETS = Object.freeze([
  Object.freeze({ key: 'G1-A', type: 'BODY_TUBE', manufacturer: 'G1 proof', partno: 'G1-A', digest: '726e26d7f3618af491f94460622c5110' }),
  Object.freeze({ key: 'G1-B', type: 'BODY_TUBE', manufacturer: 'G1 proof', partno: 'G1-B', digest: '878cd7a8940521985be965ad48933d20' }),
]);
const presetEffectKeys = 'automatic,cg,density,filled,innerRadius,length,listeners,mass,preset,presetDigest,radius,thickness,volume';
const effectKeys = 'automatic,cg,mass,preset,radius,thickness';
function require(value, code, message) { if (!value) throw new OrkError(code, message); }
function exactShape(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
}
export function field(archive, tube, name) {
  const matches = tube.children.filter(node => node.name === name);
  require(matches.length === 1, 'UNSUPPORTED_RADIUS_INPUT', `Expected one ${name}`);
  const node = matches[0], raw = archive.xml.slice(node.contentStart, node.contentEnd);
  require(!node.selfClosing && !node.children.length && !Object.keys(node.attributes).length &&
    !raw.includes('<') && !raw.includes('&'), 'UNSUPPORTED_RADIUS_INPUT', `Ambiguous ${name} content`);
  return { node, raw, text: raw.trim() };
}
export function numeric(text, name) {
  require(numberText.test(text) && Number.isFinite(Number(text)), 'UNSUPPORTED_RADIUS_INPUT', `Expected finite numeric ${name}`);
  return Number(text);
}
function projection(archive, id) {
  require(archive.mode === 'editable', 'PRESERVATION_ONLY', archive.diagnostics.join(', '));
  const targets = archive.parsed.components.filter(node => node.id === id);
  require(targets.length === 1 && targets[0].name === 'bodytube', 'UNSUPPORTED_RADIUS_INPUT', 'Expected one identified BodyTube');
  const tube = targets[0];
  const presets = tube.children.filter(node => node.name === 'preset');
  require(presets.length <= 1, 'UNSUPPORTED_RADIUS_INPUT', 'Ambiguous preset');
  let preset;
  if (presets.length) {
    const node = presets[0];
    require(node.selfClosing && Object.keys(node.attributes).sort().join(',') === 'digest,manufacturer,partno,type',
      'UNSUPPORTED_RADIUS_INPUT', 'Expected an exact catalog preset reference');
    require(!archive.parsed.components.some(component => component.children.some(n =>
      ['radius', 'outerradius', 'innerradius', 'foreradius', 'aftradius'].includes(n.name) && /^auto(?:\s|$)/.test(n.text.trim()))),
      'UNSUPPORTED_RADIUS_INPUT', 'Preset radius proof requires explicit geometry dependencies');
    preset = PROOF_PRESETS.find(p => ['type', 'manufacturer', 'partno', 'digest'].every(k => node.attributes[k]?.value === p[k]));
    require(preset, 'UNSUPPORTED_RADIUS_INPUT', 'Preset is absent from the bounded digest-checked catalog');
    // Preset import is order-dependent. Match the desktop saver: reference first,
    // then explicit scalar parameters while preset clearing is suppressed.
    require(['radius', 'thickness', 'length', 'material'].every(name => tube.children.find(n => n.name === name)?.start >= node.end),
      'UNSUPPORTED_RADIUS_INPUT', 'Unsupported preset/parameter order');
  }
  const radius = field(archive, tube, 'radius'), thickness = field(archive, tube, 'thickness'), length = field(archive, tube, 'length');
  const materials = tube.children.filter(node => node.name === 'material');
  require(materials.length === 1 && materials[0].attributes.type?.value === 'bulk' &&
    !materials[0].children.length, 'UNSUPPORTED_RADIUS_INPUT', 'Expected one bulk material');
  const density = numeric(materials[0].attributes.density?.value ?? '', 'material density');
  const outerRadius = numeric(radius.text, 'explicit radius');
  const filled = thickness.text === 'filled';
  const wall = filled ? outerRadius : numeric(thickness.text, 'thickness');
  const bodyLength = numeric(length.text, 'explicit length');
  require(bodyLength > 0 && bodyLength <= 100 && outerRadius > 0 && outerRadius <= 1 &&
    wall >= 0 && wall <= outerRadius && density > 0 && density <= 50000,
    'UNSUPPORTED_RADIUS_INPUT', 'Input exceeds the bounded Java radius facade');
  return { input: { schema: 1, componentId: id, length: bodyLength, radius: outerRadius,
    thickness: wall, filled, density, ...(preset ? { preset } : {}) }, radius, thickness, preset: presets[0] };
}

/** Intrinsic BodyTube inputs only. Mass/CG overrides remain opaque, untouched XML. */
export function tubeRadiusInput(archive, id) { return projection(archive, id).input; }

function validateEdit(archive, input, effects) {
  require(exactShape(input, input.preset ? inputKeys.replace(',radius', ',preset,radius') : inputKeys), 'INVALID_RADIUS_INPUT', 'Unsupported radius input schema');
  const current = projection(archive, input.componentId);
  require(Object.entries(current.input).every(([key, value]) => (key === 'preset' ? JSON.stringify(input[key]) === JSON.stringify(value) : Object.is(input[key], value))),
    'CONFLICT', 'The complete tube radius input changed');
  require(exactShape(effects, input.preset ? presetEffectKeys : effectKeys) && effects.automatic === false &&
    effects.preset === (!!input.preset && effects.radius === input.radius) &&
    (!input.preset || (effects.presetDigest === (effects.preset ? input.preset.digest : null) &&
      effects.length === input.length && effects.density === input.density && effects.filled === input.filled && effects.listeners === 0 &&
      Number.isFinite(effects.innerRadius) && Number.isFinite(effects.volume))) &&
    ['radius', 'thickness', 'mass', 'cg'].every(key => typeof effects[key] === 'number' && Number.isFinite(effects[key])) &&
    effects.radius > 0 && effects.radius <= 1 && effects.thickness >= 0 && effects.thickness <= effects.radius &&
    effects.mass >= 0 && effects.cg >= 0 && (!input.filled || effects.thickness === effects.radius),
    'INVALID_RADIUS_EFFECTS', 'Expected bounded intrinsic effects from the trusted Java facade');
  return current;
}
export function simulationStatusChanges(archive, affected) {
  const changes = [];
  archive.parsed.simulations.forEach((node, index) => {
    if (!affected(node)) return;
    const data = node.children.filter(child => child.name === 'flightdata');
    require(data.length <= 1, 'UNSUPPORTED_RADIUS_INPUT', 'Ambiguous stored flight data');
    if (!data.length) return;
    const status = node.attributes.status?.value;
    require(['uptodate', 'loaded', 'outdated'].includes(status), 'UNSUPPORTED_RADIUS_INPUT',
      'Stored-result status is outside the proven radius invalidation subset');
    if (status === 'outdated') return;
    const opening = archive.xml.slice(node.start, node.contentStart);
    const attributes = [...opening.matchAll(/\s+([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g)];
    const matches = attributes.filter(attribute => attribute[1] === 'status');
    const match = matches[0];
    require(matches.length === 1 && match[3] === status, 'UNSUPPORTED_RADIUS_INPUT', 'Ambiguous simulation status text');
    const start = node.start + match.index + match[0].indexOf(match[2]) + 1;
    changes.push({ index, before: status, after: 'outdated', start, end: start + status.length });
  });
  return changes;
}

function simulationChanges(archive, input, effects) {
  if (effects.radius === input.radius && effects.thickness === input.thickness) return [];
  return simulationStatusChanges(archive, () => true);
}

/** Replace only accepted lexical spans, retaining the upload and sidecar mapping. */
export async function replaceSpans(archive, replacements) {
  if (!replacements.length) return archive;
  let xml = archive.xml;
  for (const { start, end, text } of replacements.sort((a, b) => b.start - a.start)) xml = xml.slice(0, start) + text + xml.slice(end);
  const candidate = { ...archive, changed: true, entries: archive.entries.map(entry => entry.path === 'rocket.ork'
    ? { path: entry.path, bytes: encoder.encode(xml) } : entry) };
  const exported = await exportArchive(candidate);
  const imported = await importArchive(exported.bytes, exported.identity);
  return { ...imported, original: archive.original.slice(), changed: true };
}

/** Explicit document effects to include with full-archive-hash command preconditions. */
export function radiusSimulationEffects(archive, input, effects) {
  validateEdit(archive, input, effects);
  return simulationChanges(archive, input, effects).map(({ index, before, after }) => ({ index, before, after }));
}

/** Apply accepted Java scalar effects and required document result invalidation. */
export async function applyTubeRadius(archive, input, effects) {
  const current = validateEdit(archive, input, effects);
  // The original failed two-span proof is retained: Java also invalidates results.
  const simulations = simulationChanges(archive, input, effects);
  if (effects.radius === input.radius && effects.thickness === input.thickness) return archive;
  const replacements = [
    { start: current.radius.node.contentStart, end: current.radius.node.contentEnd, text: String(effects.radius) },
    { start: current.thickness.node.contentStart, end: current.thickness.node.contentEnd,
      text: input.filled ? 'filled' : String(effects.thickness) },
    ...simulations.map(change => ({start: change.start, end: change.end, text: change.after})),
    ...(current.preset && !effects.preset ? [{ start: current.preset.start, end: current.preset.end, text: '' }] : []),
  ];
  return replaceSpans(archive, replacements);
}
