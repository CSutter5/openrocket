import { exportArchive, importArchive, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
import { componentResultChanges } from './archive-edit';
import generated from '../build/components/defaults.json';
export interface FieldRule { kind: string; values?: string[]; special?: string; separator?: string; materialType?: string }
interface DefaultComponent { fields: Record<string, FieldRule>; name: string; xml: string; additionalStageXml?: string; parents: string[]; body: boolean }
export const componentDefaults: Record<string, DefaultComponent> = generated;
const templateId = '00000000-0000-4000-8000-000000000001';
type Selection = { type: string; parent: number };
export function additionTarget(nodes: Selection[], selected: number, type: string): { parent: number; after?: number } | undefined {
  const defaults = componentDefaults[type], node = nodes[selected];
  if (!defaults || type === 'rocket' || !node) return;
  if (type === 'stage') return { parent: 0 };
  if (defaults.parents.includes(node.type)) return { parent: selected };
  if (defaults.body && componentDefaults[node.type]?.body && defaults.parents.includes(nodes[node.parent]?.type)) return { parent: node.parent, after: selected };
}
function append(archive: ExpandedArchive, parent: XmlNode, text: string) {
  return parent.selfClosing ? { start: parent.start, end: parent.end, text: archive.xml.slice(parent.start, parent.end).replace(/\/>$/, () => `>${text}</${parent.name}>`) } : { start: parent.contentEnd, end: parent.contentEnd, text };
}
export async function newRocket() {
  const root = componentDefaults.rocket.xml.replace(templateId, crypto.randomUUID());
  const stage = componentDefaults.stage.xml.replace(templateId, crypto.randomUUID());
  return importArchive(new TextEncoder().encode(`<openrocket version="1.11" creator="OpenRocket Web">${root.replace('</rocket>', `<subcomponents>${stage}</subcomponents></rocket>`)}</openrocket>`));
}
export async function addComponent(archive: ExpandedArchive, selectedId: string, type: string, position: 'after' | 'end') {
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  if (archive.parsed.components.length >= 64) throw new Error('This editor supports at most 64 components');
  if (!['after', 'end'].includes(position)) throw new Error('Unknown insertion position');
  const nodes = archive.parsed.components, selected = nodes.findIndex(n => n.id === selectedId);
  const target = additionTarget(nodes.map(n => ({ type: n.name, parent: nodes.indexOf(n.parent?.parent!) })), selected, type);
  if (!target) throw new Error('Select a compatible parent component');
  const id = crypto.randomUUID(), defaults = componentDefaults[type];
  const stageNumber = nodes.filter(n => ['stage', 'parallelstage'].includes(n.name)).length;
  let xml = (type === 'stage' && stageNumber ? defaults.additionalStageXml! : defaults.xml).replace(templateId, id);
  const spans = componentResultChanges(archive);
  if (type === 'stage') {
    for (const config of nodes[0].children.filter(n => n.name === 'motorconfiguration')) spans.push(append(archive, config, `<stage number="${stageNumber}" active="true"/>`));
  }
  const parent = nodes[target.parent], lists = parent.children.filter(n => n.name === 'subcomponents');
  if (lists.length > 1 || lists.some(n => Object.keys(n.attributes).length)) throw new Error('Ambiguous component list');
  if (target.after !== undefined && position === 'after') spans.push({ start: nodes[target.after].end, end: nodes[target.after].end, text: xml });
  else spans.push(lists.length ? append(archive, lists[0], xml) : append(archive, parent, `<subcomponents>${xml}</subcomponents>`));
  let changed = archive.xml;
  for (const span of spans.sort((a, b) => b.start - a.start)) changed = changed.slice(0, span.start) + span.text + changed.slice(span.end);
  const candidate = { ...archive, changed: true, entries: archive.entries.map(e => e.path === 'rocket.ork' ? { ...e, bytes: new TextEncoder().encode(changed), sha256: '' } : e) };
  const exported = await exportArchive(candidate), accepted = await importArchive(exported.bytes, exported.identity);
  if (accepted.mode !== 'editable' || accepted.parsed.components.length !== nodes.length + 1 || !accepted.parsed.components.some(n => n.id === id)) throw new Error('New component could not be safely reopened');
  return { archive: { ...accepted, original: archive.original.slice(), changed: true }, id };
}

export function fieldRule(type: string, name: string): FieldRule | undefined { return componentDefaults[type]?.fields[name]; }
export function attributeChoices(name: string, attribute: string): string[] | undefined {
  if (['position', 'axialoffset'].includes(name) && ['method', 'type'].includes(attribute)) return ['absolute', 'after', 'top', 'middle', 'bottom'];
  if (name === 'angleoffset' && attribute === 'method') return ['relative', 'fixed'];
  if (name === 'radiusoffset' && attribute === 'method') return ['coaxial', 'free', 'relative', 'surface'];
  if (name === 'tabposition' && attribute === 'relativeto') return ['top', 'middle', 'bottom', 'front', 'center', 'end'];
}
