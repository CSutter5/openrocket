import { exportArchive, importArchive, OrkError } from './index.js';

const encoder = new TextEncoder();
const numberText = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const inputKeys = 'componentId,density,filled,length,radius,schema,thickness';
export const PROOF_PRESETS = Object.freeze([
  Object.freeze({ key: 'G1-A', type: 'BODY_TUBE', manufacturer: 'G1 proof', partno: 'G1-A', digest: '726e26d7f3618af491f94460622c5110' }),
  Object.freeze({ key: 'G1-B', type: 'BODY_TUBE', manufacturer: 'G1 proof', partno: 'G1-B', digest: '878cd7a8940521985be965ad48933d20' }),
]);
const presetEffectKeys = 'automatic,cg,density,filled,innerRadius,length,listeners,mass,preset,presetDigest,radius,thickness,volume';
const ringEffectKeys = ['outerRadius', 'innerRadius', 'outerAutomatic', 'innerAutomatic', 'thickness', 'length', 'density', 'mass', 'cg', 'cgMass',
  'longitudinalUnitInertia', 'rotationalUnitInertia', 'axialMethod', 'axialOffset', 'positionX', 'radialPosition', 'radialDirection',
  'instanceCount', 'instanceSeparation', 'bounds', 'preset', 'listeners'].sort().join(',');
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
function ringDependency(archive, tube, preset) {
  const automatic = archive.parsed.components.flatMap(component => component.children.filter(n =>
    ['radius', 'outerradius', 'innerradius', 'foreradius', 'aftradius'].includes(n.name) && /^auto(?:\s|$)/.test(n.text.trim()))
    .map(node => ({ component, node })));
  const children = automatic.filter(({ component }) => component.parent?.name === 'subcomponents' && component.parent.parent === tube);
  if (!children.length) {
    require(!preset || automatic.length === 0, 'UNSUPPORTED_RADIUS_INPUT', 'Preset radius proof requires explicit or supported ring dependencies');
    return {};
  }
  require(children.length === 1 && automatic.length === 1, 'UNSUPPORTED_RADIUS_INPUT', 'Only one automatic geometry dependency is supported');
  const ring = children[0].component;
  require(ring.name === 'centeringring' && ring.id && children[0].node.name === 'outerradius' &&
    !ring.children.some(n => ['preset', 'subcomponents'].includes(n.name)), 'UNSUPPORTED_RADIUS_INPUT', 'Expected one direct child CenteringRing without preset/children');
  require(field(archive, ring, 'outerradius').text === 'auto', 'UNSUPPORTED_RADIUS_INPUT', 'Expected exact automatic outer-radius token');
  const innerRadius = numeric(field(archive, ring, 'innerradius').text, 'explicit ring inner radius');
  const length = numeric(field(archive, ring, 'length').text, 'ring length');
  const materials = ring.children.filter(n => n.name === 'material');
  require(materials.length === 1 && materials[0].attributes.type?.value === 'bulk' && !materials[0].children.length,
    'UNSUPPORTED_RADIUS_INPUT', 'Expected one ring bulk material');
  const density = numeric(materials[0].attributes.density?.value ?? '', 'ring density');
  const position = (name, attribute) => {
    const nodes = ring.children.filter(n => n.name === name), node = nodes[0];
    require(nodes.length === 1 && !node.selfClosing && !node.children.length && Object.keys(node.attributes).join(',') === attribute &&
      node.attributes[attribute].value === 'top', 'UNSUPPORTED_RADIUS_INPUT', 'Ring must use explicit TOP positioning');
    const raw = archive.xml.slice(node.contentStart, node.contentEnd).trim();
    return numeric(raw, 'ring position');
  };
  const axialOffset = position('axialoffset', 'method');
  require(position('position', 'type') === axialOffset, 'UNSUPPORTED_RADIUS_INPUT', 'Legacy/current ring positions disagree');
  for (const name of ['radialposition', 'radialdirection', 'instanceseparation']) require(numeric(field(archive, ring, name).text, name) === 0,
    'UNSUPPORTED_RADIUS_INPUT', 'Ring must be centered and have no instance separation');
  require(numeric(field(archive, ring, 'instancecount').text, 'instance count') === 1 && length > 0 && length <= 100 &&
    innerRadius >= 0 && innerRadius <= 1 && density > 0 && density <= 50000 && axialOffset >= 0,
    'UNSUPPORTED_RADIUS_INPUT', 'Ring input exceeds proof bounds');
  const rockets = archive.parsed.components.filter(n => n.name === 'rocket');
  require(rockets.length === 1, 'UNSUPPORTED_RADIUS_INPUT', 'Expected one rocket');
  const configurationIds = rockets[0].children.filter(n => n.name === 'motorconfiguration').map(n => n.attributes.configid?.value);
  require(configurationIds.length >= 1 && configurationIds.length <= 16 && new Set(configurationIds).size === configurationIds.length &&
    configurationIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id ?? '')),
    'UNSUPPORTED_RADIUS_INPUT', 'Unsupported/ambiguous flight configurations');
  return { ring: { componentId: ring.id, parentId: tube.id, length, innerRadius, density, axialOffset,
    axialMethod: 'TOP', radialPosition: 0, radialDirection: 0, instanceCount: 1, instanceSeparation: 0 }, configurationIds };
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
  const dependency = ringDependency(archive, tube, preset);
  require(!dependency.ring || (dependency.ring.innerRadius <= (filled ? 0 : outerRadius - wall) &&
    dependency.ring.axialOffset + dependency.ring.length <= bodyLength), 'UNSUPPORTED_RADIUS_INPUT', 'Ring does not fit its parent tube');
  return { input: { schema: 1, componentId: id, length: bodyLength, radius: outerRadius,
    thickness: wall, filled, density, ...(preset ? { preset } : {}), ...dependency }, radius, thickness, preset: presets[0] };
}

/** Intrinsic BodyTube inputs only. Mass/CG overrides remain opaque, untouched XML. */
export function tubeRadiusInput(archive, id) { return projection(archive, id).input; }

function validateEdit(archive, input, effects) {
  require(exactShape(input, [...inputKeys.split(','), ...(input?.preset ? ['preset'] : []), ...(input?.ring ? ['ring', 'configurationIds'] : [])].sort().join(',')), 'INVALID_RADIUS_INPUT', 'Unsupported radius input schema');
  const current = projection(archive, input.componentId);
  require(Object.entries(current.input).every(([key, value]) => (value !== null && typeof value === 'object' ? JSON.stringify(input[key]) === JSON.stringify(value) : Object.is(input[key], value))),
    'CONFLICT', 'The complete tube radius input changed');
  require(exactShape(effects, input.ring ? presetEffectKeys.replace(',thickness', ',ring,thickness') : input.preset ? presetEffectKeys : effectKeys) && effects.automatic === false &&
    effects.preset === (!!input.preset && effects.radius === input.radius) &&
    (!(input.preset || input.ring) || (effects.presetDigest === (effects.preset ? input.preset.digest : null) &&
      effects.length === input.length && effects.density === input.density && effects.filled === input.filled && effects.listeners === 0 &&
      Number.isFinite(effects.innerRadius) && Number.isFinite(effects.volume))) &&
    ['radius', 'thickness', 'mass', 'cg'].every(key => typeof effects[key] === 'number' && Number.isFinite(effects[key])) &&
    effects.radius > 0 && effects.radius <= 1 && effects.thickness >= 0 && effects.thickness <= effects.radius &&
    effects.mass >= 0 && effects.cg >= 0 && (!input.filled || effects.thickness === effects.radius),
    'INVALID_RADIUS_EFFECTS', 'Expected bounded intrinsic effects from the trusted Java facade');
  if (input.ring) {
    require(exactShape(effects.ring, ringEffectKeys) && effects.ring.outerAutomatic === true && effects.ring.innerAutomatic === false && effects.ring.preset === false &&
      effects.ring.listeners === 0 && ['outerRadius', 'innerRadius', 'mass', 'cg', 'cgMass', 'thickness', 'positionX',
        'longitudinalUnitInertia', 'rotationalUnitInertia'].every(k => Number.isFinite(effects.ring[k])) &&
      effects.ring.axialMethod === input.ring.axialMethod && effects.ring.axialOffset === input.ring.axialOffset &&
      effects.ring.radialPosition === 0 && effects.ring.radialDirection === 0 && effects.ring.instanceCount === 1 && effects.ring.instanceSeparation === 0 &&
      Array.isArray(effects.ring.bounds) && effects.ring.bounds.length === 6 && effects.ring.bounds.every(Number.isFinite) &&
      effects.ring.innerRadius === input.ring.innerRadius && effects.ring.length === input.ring.length && effects.ring.density === input.ring.density,
      'INVALID_RADIUS_EFFECTS', 'Expected actual Java automatic ring effects');
    require(effects.ring.outerRadius >= effects.ring.innerRadius, 'UNSUPPORTED_RADIUS_INPUT',
      'Edit would make the automatic ring hole larger than its parent; desktop reload would disable automation');
  }
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
