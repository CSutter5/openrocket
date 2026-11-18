import { exportArchive, importArchive, OrkError } from './index.js';

const encoder = new TextEncoder();
const numberText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const inputKeys = 'componentId,density,filled,length,radius,schema,thickness';
const effectKeys = 'automatic,cg,mass,preset,radius,thickness';
function require(value, code, message) { if (!value) throw new OrkError(code, message); }
function exactShape(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys;
}
function field(archive, tube, name) {
  const matches = tube.children.filter(node => node.name === name);
  require(matches.length === 1, 'UNSUPPORTED_RADIUS_INPUT', `Expected one ${name}`);
  const node = matches[0], raw = archive.xml.slice(node.contentStart, node.contentEnd);
  require(!node.selfClosing && !node.children.length && !Object.keys(node.attributes).length &&
    !raw.includes('<') && !raw.includes('&'), 'UNSUPPORTED_RADIUS_INPUT', `Ambiguous ${name} content`);
  return { node, raw, text: raw.trim() };
}
function numeric(text, name) {
  require(numberText.test(text) && Number.isFinite(Number(text)), 'UNSUPPORTED_RADIUS_INPUT', `Expected finite numeric ${name}`);
  return Number(text);
}
function projection(archive, id) {
  require(archive.mode === 'editable', 'PRESERVATION_ONLY', archive.diagnostics.join(', '));
  const targets = archive.parsed.components.filter(node => node.id === id);
  require(targets.length === 1 && targets[0].name === 'bodytube', 'UNSUPPORTED_RADIUS_INPUT', 'Expected one identified BodyTube');
  const tube = targets[0];
  require(!tube.children.some(node => node.name === 'preset'), 'UNSUPPORTED_RADIUS_INPUT', 'Preset-backed tubes require additional setter effects');
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
    thickness: wall, filled, density }, radius, thickness };
}

/** Intrinsic BodyTube inputs only. Mass/CG overrides remain opaque, untouched XML. */
export function tubeRadiusInput(archive, id) { return projection(archive, id).input; }

function validateEdit(archive, input, effects) {
  require(exactShape(input, inputKeys), 'INVALID_RADIUS_INPUT', 'Unsupported radius input schema');
  const current = projection(archive, input.componentId);
  require(Object.entries(current.input).every(([key, value]) => Object.is(input[key], value)),
    'CONFLICT', 'The complete tube radius input changed');
  require(exactShape(effects, effectKeys) && effects.automatic === false && effects.preset === false &&
    ['radius', 'thickness', 'mass', 'cg'].every(key => typeof effects[key] === 'number' && Number.isFinite(effects[key])) &&
    effects.radius > 0 && effects.radius <= 1 && effects.thickness >= 0 && effects.thickness <= effects.radius &&
    effects.mass >= 0 && effects.cg >= 0 && (!input.filled || effects.thickness === effects.radius),
    'INVALID_RADIUS_EFFECTS', 'Expected bounded intrinsic effects from the trusted Java facade');
  return current;
}
function simulationChanges(archive, input, effects) {
  if (effects.radius === input.radius && effects.thickness === input.thickness) return [];
  const changes = [];
  archive.parsed.simulations.forEach((node, index) => {
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
    ...simulations.map(change => ({start: change.start, end: change.end, text: change.after}))
  ].sort((a, b) => b.start - a.start);
  let xml = archive.xml;
  for (const { start, end, text } of replacements) xml = xml.slice(0, start) + text + xml.slice(end);
  const candidate = { ...archive, changed: true, entries: archive.entries.map(entry => entry.path === 'rocket.ork'
    ? { path: entry.path, bytes: encoder.encode(xml) } : entry) };
  const exported = await exportArchive(candidate);
  const imported = await importArchive(exported.bytes, exported.identity);
  // Retain the first upload for recovery while the parsed state describes the edit.
  return { ...imported, original: archive.original.slice(), changed: true };
}
