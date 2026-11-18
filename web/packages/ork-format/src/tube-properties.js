import { OrkError } from './index.js';
import { tubeRadiusInput, field, replaceSpans, simulationStatusChanges } from './radius.js';
const require = (value, code, message) => { if (!value) throw new OrkError(code, message); };
const keys = 'automatic,cg,density,filled,innerRadius,length,listeners,mass,preset,presetDigest,radius,thickness,volume';
export function tubePropertyInput(archive, id) {
  const input = tubeRadiusInput(archive, id);
  const tube = archive.parsed.components.find(n => n.id === id);
  const descendants = archive.parsed.components.filter(n => {
    for (let parent = n.parent; parent; parent = parent.parent) if (parent === tube) return true;
    return false;
  });
  require(!input.ring && !descendants.some(n => n.children.some(c =>
    ['radius','outerradius','innerradius','foreradius','aftradius'].includes(c.name) && /^auto(?:\s|$)/.test(c.text.trim()))),
    'UNSUPPORTED_TUBE_PROPERTY', 'Additional tube properties require an explicit tube without automatic descendant geometry. Radius keeps its existing supported subset.');
  return input;
}
export async function applyTubeProperty(archive, input, property, value, effects, functionalChange) {
  const current = tubePropertyInput(archive, input.componentId);
  require(JSON.stringify(current) === JSON.stringify(input), 'CONFLICT', 'Complete tube input changed');
  require(['length','thickness'].includes(property) && Number.isFinite(value) &&
    (property === 'length' ? value > 0 && value <= 100 : value >= 0 && value <= 1),
    'INVALID_TUBE_PROPERTY', 'Property value outside supported SI bounds');
  require(typeof functionalChange === 'boolean' && effects && Object.keys(effects).sort().join(',') === keys && effects.automatic === false && effects.listeners === 0 &&
    ['radius','thickness','length','density','mass','cg','innerRadius','volume'].every(k => Number.isFinite(effects[k])) &&
    effects.radius === input.radius && effects.length === (property === 'length' ? value : input.length) &&
    effects.density === input.density && effects.filled === (property === 'thickness' ? false : input.filled) &&
    (property === 'thickness' || effects.thickness === input.thickness) && effects.thickness >= 0 && effects.thickness <= input.radius &&
    effects.mass >= 0 && effects.cg >= 0 && effects.volume >= 0 && effects.innerRadius >= 0,
    'INVALID_TUBE_EFFECTS', 'Expected bounded Java property effects');
  const changed = effects.length !== input.length || effects.thickness !== input.thickness || effects.filled !== input.filled || effects.density !== input.density;
  const keepPreset = !!input.preset && (!functionalChange || property === 'length');
  require(effects.preset === keepPreset && effects.presetDigest === (keepPreset ? input.preset.digest : null), 'INVALID_TUBE_EFFECTS', 'Unexpected preset effect');
  if (!changed && !functionalChange) return archive;
  const node = archive.parsed.components.find(n => n.id === input.componentId), replacements = [];
  const target = field(archive, node, property).node;
  replacements.push({start:target.contentStart,end:target.contentEnd,text:String(effects[property])});
  if (input.preset && !keepPreset) {
    const preset = node.children.find(n => n.name === 'preset'); replacements.push({start:preset.start,end:preset.end,text:''});
  }
  replacements.push(...simulationStatusChanges(archive, () => functionalChange).map(c => ({start:c.start,end:c.end,text:c.after})));
  return replaceSpans(archive, replacements);
}
