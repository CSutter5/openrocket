import { OrkError } from './index.js';
import { field, numeric, replaceSpans, simulationStatusChanges } from './radius.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function require(value, message) { if (!value) throw new OrkError('UNSUPPORTED_DEPLOYMENT_INPUT', message); }
const events = ['LAUNCH', 'EJECTION', 'APOGEE', 'ALTITUDE', 'LOWER_STAGE_SEPARATION', 'NEVER'];
function parameters(archive, node) {
  const text = field(archive, node, 'deployevent').text;
  const event = events.find(e => e.toLowerCase().replaceAll('_', '') === text);
  const altitude = numeric(field(archive, node, 'deployaltitude').text, 'deployment altitude');
  const delay = numeric(field(archive, node, 'deploydelay').text, 'deployment delay');
  require(event && altitude >= 0 && altitude <= 100000 && delay >= 0 && delay <= 1000, 'Unsupported deployment parameters');
  return { event, altitude, delay, listeners: 0 };
}
function projection(archive, componentId) {
  require(archive.mode === 'editable', 'Archive must be editable');
  const targets = archive.parsed.components.filter(n => n.id === componentId && n.name === 'parachute');
  require(targets.length === 1, 'Expected an identified parachute');
  const node = targets[0];
  // Imported presets on this target and incomplete override records are not projected.
  require(!node.children.some(n => n.name === 'preset'), 'Preset-backed recovery devices are outside this proof');
  const rockets = archive.parsed.components.filter(n => n.name === 'rocket');
  require(rockets.length === 1, 'Expected one rocket');
  const configs = rockets[0].children.filter(n => n.name === 'motorconfiguration');
  const configurationIds = configs.map(n => n.attributes.configid?.value);
  require(configs.length >= 1 && configs.length <= 16 && configurationIds.every(id => uuid.test(id ?? '')) &&
    new Set(configurationIds).size === configs.length, 'Unsupported/ambiguous flight configurations');
  const defaults = parameters(archive, node);
  const nodes = node.children.filter(n => n.name === 'deploymentconfiguration');
  const overrides = nodes.map(n => {
    const id = n.attributes.configid?.value;
    require(configurationIds.includes(id) && Object.keys(n.attributes).join(',') === 'configid' &&
      n.children.length === 3 && n.children.every(c => ['deployevent', 'deployaltitude', 'deploydelay'].includes(c.name)),
      'Unknown, partial or opaque deployment override');
    require(n.start >= Math.max(...['deployevent', 'deployaltitude', 'deploydelay'].map(k => field(archive, node, k).node.end)),
      'Deployment default must precede overrides');
    let residue = archive.xml.slice(n.contentStart, n.contentEnd);
    for (const child of [...n.children].sort((a, b) => b.start - a.start)) {
      residue = residue.slice(0, child.start - n.contentStart) + residue.slice(child.end - n.contentStart);
    }
    require(!residue.trim(), 'Opaque content inside a removed deployment override');
    return { id, parameters: parameters(archive, n) };
  });
  require(new Set(overrides.map(o => o.id)).size === overrides.length, 'Duplicate deployment override');
  // All imported simulation configuration references must resolve before targeted invalidation.
  const simulationConfigurations = archive.parsed.simulations.map(sim => {
    const conditions = sim.children.filter(n => n.name === 'conditions');
    require(conditions.length === 1, 'Ambiguous simulation conditions');
    const id = field(archive, conditions[0], 'configid').text;
    require(configurationIds.includes(id), 'Unresolved simulation configuration');
    return id;
  });
  return { input: { schema: 1, componentId, configurationIds, default: defaults, overrides, simulationConfigurations }, nodes };
}
export function deploymentInput(archive, componentId) { return projection(archive, componentId).input; }
export function deploymentState(input) {
  return { default: input.default, overrides: input.overrides,
    effective: input.configurationIds.map(id => ({ id, inherited: !input.overrides.some(o => o.id === id),
      parameters: input.overrides.find(o => o.id === id)?.parameters ?? input.default })) };
}
export function deploymentSimulationEffects(archive, input, configurationId, effects) {
  require(JSON.stringify(projection(archive, input.componentId).input) === JSON.stringify(input), 'Stale deployment projection');
  require(input.configurationIds.includes(configurationId), 'Unknown selected configuration');
  require(JSON.stringify(effects.before) === JSON.stringify(deploymentState(input)), 'Java deployment before-state mismatch');
  return effects.functionalChange ? simulationStatusChanges(archive, node =>
    input.simulationConfigurations[archive.parsed.simulations.indexOf(node)] === configurationId) : [];
}
export async function applyDeploymentReset(archive, input, configurationId, effects) {
  const statuses = deploymentSimulationEffects(archive, input, configurationId, effects);
  const { nodes } = projection(archive, input.componentId);
  const selected = nodes.find(n => n.attributes.configid.value === configurationId);
  return replaceSpans(archive, [
    ...(selected ? [{ start: selected.start, end: selected.end, text: '' }] : []),
    ...statuses.map(s => ({ start: s.start, end: s.end, text: s.after })),
  ]);
}
