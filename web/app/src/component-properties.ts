import type { ExpandedArchive } from '@openrocket/ork-format';
import { radiusEdit, tubePropertyEdit } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { fieldRule, attributeChoices } from './components';
import { editArchive, element, componentResultChanges, type Span } from './archive-edit';

const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const signed = new Set(['axialoffset', 'position', 'radialdirection', 'angleoffset', 'radiusoffset', 'rotation', 'clusterrotation', 'sweeplength', 'cant', 'overridecg', 'tabposition', 'deployaltitude', 'separationaltitude']);
const presentation = new Set(['comment', 'color', 'linestyle', 'designer', 'revision', 'kitname', 'designtype']);
function number(text: string, name: string) {
  if (!decimal.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error(`${name}: enter a finite decimal number`);
  return Number(text);
}
function validate(type: string, name: string, value: string, attributes: Record<string, string>) {
  const rule = fieldRule(type, name), text = value.trim();
  for (const input of [value, ...Object.values(attributes)]) if (typeof input !== 'string' || /[\x00-\x08\x0b\x0c\x0e-\x1f\uD800-\uDFFF]/u.test(input)) throw new Error('Enter valid XML text');
  if (rule?.values && !rule.values.includes(text)) throw new Error(`${name}: choose a listed value`);
  if (rule?.kind === 'BooleanSetter' && !['true', 'false'].includes(text)) throw new Error(`${name}: choose true or false`);
  const numeric = rule && ['DoubleSetter', 'OverrideSetter', 'IntSetter', 'AxialPositionSetter', 'AnglePositionSetter', 'RadiusPositionSetter', 'FinTabPositionSetter'].includes(rule.kind);
  if (numeric) {
    const special = rule.special && (text.toLowerCase() === rule.special || rule.separator && text.toLowerCase().startsWith(rule.special + rule.separator));
    if (!special || text.toLowerCase() !== rule.special) {
      const token = special ? text.slice(rule!.special!.length).trim() : text;
      const value = number(token, name);
      if (!signed.has(name) && value < 0) throw new Error(`${name}: enter a non-negative number`);
      if (rule.kind === 'IntSetter' && (!/^[-+]?\d+$/.test(token) || !Number.isInteger(value) || value < (name === 'linecount' ? 0 : 1) || value > (type.endsWith('finset') && type !== 'tubefinset' ? 8 : 64))) throw new Error(`${name}: enter a supported integer count`);
    }
  }
  for (const [key, input] of Object.entries(attributes)) {
    const choices = attributeChoices(name, key);
    if (choices && !choices.includes(input)) throw new Error(`${name}/${key}: choose a listed method`);
    if (['density', 'shearModulus'].includes(key) && number(input, key) < 0) throw new Error(`${key}: enter a non-negative number`);
    if (name === 'color' && ['red', 'green', 'blue', 'alpha'].includes(key) && (!/^\d+$/.test(input) || Number(input) > 255)) throw new Error('Color channels must be integers from 0 to 255');
  }
  if (rule?.materialType && attributes.type && attributes.type !== rule.materialType) throw new Error(`${name}: material type must be ${rule.materialType}`);
  if (rule?.kind === 'MaterialSetter' && !text) throw new Error('Material name must not be empty');
  if (rule?.kind === 'ColorSetter' && text) throw new Error('Set the color channels; leave the color text empty');
}
export async function editComponentProperty(archive: ExpandedArchive, id: string, key: number, value: string, attributes: Record<string, string>) {
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  const component = archive.parsed.components.find(n => n.id === id), field = component?.children[key];
  if (!component || !Number.isInteger(key) || !field || field.children.length || ['name', 'id', 'subcomponents'].includes(field.name)) throw new Error('Select an editable component property');
  const originalAttributes = Object.fromEntries(Object.entries(field.attributes).map(([key, v]) => [key, v.value]));
  if (Object.keys(attributes).sort().join('\0') !== Object.keys(originalAttributes).sort().join('\0')) throw new Error('Property attribute names must be retained');
  if (value === field.text && Object.keys(attributes).every(k => attributes[k] === originalAttributes[k])) return archive;
  validate(component.name, field.name, value, attributes);
  if (decimal.test(field.text.trim()) && decimal.test(value.trim()) && Number(field.text) === Number(value) && Object.keys(attributes).every(k => attributes[k] === originalAttributes[k])) return archive;
  const spans = new Map<number, Span>();
  const replace = (node: typeof field, text: string, attrs?: Record<string, string>) => spans.set(node.start, element(archive, node, text, attrs));
  let normalized = value;
  const rule = fieldRule(component.name, field.name), oldNumber = field.text.trim().replace(/^auto /, '');
  if (value.trim() === 'auto' && rule?.separator && decimal.test(oldNumber)) normalized = `auto ${oldNumber}`;
  if (normalized === field.text && Object.keys(attributes).every(k => attributes[k] === originalAttributes[k])) return archive;
  // Reuse the established native wall/radius clamp for explicit BodyTubes.
  if (component.name === 'bodytube' && ['radius', 'thickness'].includes(field.name)) {
    const text = (name: string) => component.children.find(n => n.name === name)?.text.trim();
    const radius = Number(text('radius')?.replace(/^auto /, '')), length = Number(text('length'));
    const filled = text('thickness') === 'filled' || text('filled') === 'true';
    const thickness = filled ? radius : Number(text('thickness'));
    const density = Number(component.children.find(n => n.name === 'material')?.attributes.density?.value);
    if ([radius, length, thickness, density].every(Number.isFinite) && radius > 0 && !/^auto\b/.test(value) && value !== 'filled' && (field.name === 'radius' || !text('radius')?.startsWith('auto'))) {
      const result = JSON.parse(field.name === 'radius' ? radiusEdit(length, radius, thickness, filled, density, Number(value)) : tubePropertyEdit('', '', length, radius, thickness, filled, density, 'thickness', Number(value)));
      const wall = component.children.find(n => n.name === 'thickness');
      if (wall && !result.after.filled) replace(wall, String(result.after.thickness));
      if (field.name === 'thickness') normalized = String(result.after.thickness);
    }
  }
  replace(field, normalized, attributes);
  if (field.name === 'thickness') for (const filled of component.children.filter(n => n.name === 'filled')) replace(filled, String(value === 'filled'));
  // Keep legacy/current representations of the same native property together.
  const aliases = field.name === 'axialoffset' ? ['position'] : field.name === 'position' ? ['axialoffset']
    : ['fincount', 'instancecount'].includes(field.name) && component.name.endsWith('finset') ? ['fincount', 'instancecount']
    : field.name === 'rotation' || field.name === 'radialdirection' && component.name === 'launchlug' ? ['angleoffset']
    : field.name === 'angleoffset' ? ['rotation', ...(component.name === 'launchlug' ? ['radialdirection'] : [])] : [];
  for (const alias of component.children.filter(n => aliases.includes(n.name) && n !== field && !n.children.length)) {
    const attrs = Object.fromEntries(Object.entries(alias.attributes).map(([key, v]) => [key, v.value]));
    if (field.name === 'axialoffset') attrs.type = attributes.method;
    if (field.name === 'position') attrs.method = attributes.type;
    replace(alias, normalized, attrs);
  }
  if (component.name === 'tubefinset') for (const duplicate of component.children.filter(n => n !== field && n.name === field.name)) replace(duplicate, normalized, attributes);
  const physical = !presentation.has(field.name);
  const clearsPreset = fieldRule(component.name, field.name)?.kind === 'MaterialSetter' || /^(?:length|thickness|radius|outerradius|innerradius|shape|shapeparameter|isflipped|(?:fore|aft)shoulder(?:radius|length|thickness|capped)|diameter|linecount|linelength|striplength|stripwidth)$/.test(field.name);
  if (clearsPreset && !(component.name === 'bodytube' && field.name === 'length')) {
    for (const preset of component.children.filter(n => n.name === 'preset')) spans.set(preset.start, { start: preset.start, end: preset.end, text: '' });
  }
  if (physical) for (const status of componentResultChanges(archive)) spans.set(status.start, status);
  return editArchive(archive, [...spans.values()]);
}
