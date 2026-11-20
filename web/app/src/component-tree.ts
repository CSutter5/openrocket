import type { ExpandedArchive } from '@openrocket/ork-format';
import { editArchive, element, componentResultChanges, type Span } from './archive-edit';
export type TreeOperation = 'up' | 'down' | 'duplicate' | 'delete';
export function treeControls(nodes: { type: string; parent: number }[], selected: number) {
  const component = nodes[selected], parent = component?.parent ?? -1;
  const siblings = nodes.map((n, i) => n.parent === parent ? i : -1).filter(i => i >= 0), position = siblings.indexOf(selected);
  const child = parent >= 0;
  return { up: child && position > 0, down: child && position < siblings.length - 1, duplicate: child, delete: child && !(component.type === 'stage' && siblings.length === 1) };
}
const stages = (archive: ExpandedArchive) => archive.parsed.components.filter(n => ['stage', 'parallelstage'].includes(n.name));
async function stageReferences(before: ExpandedArchive, after: ExpandedArchive) {
  const previous = stages(before), current = stages(after);
  if (previous.map(n => n.id).join() === current.map(n => n.id).join()) return after;
  const spans: Span[] = [];
  for (const config of after.parsed.components[0].children.filter(n => n.name === 'motorconfiguration')) {
    const refs = config.children.filter(n => n.name === 'stage'), flags = new Map<string, string>();
    for (const ref of refs) {
      const number = Number(ref.attributes.number?.value), active = ref.attributes.active?.value;
      if (!Number.isInteger(number) || !previous[number]?.id || !['true', 'false'].includes(active) || flags.has(previous[number].id!)) throw new Error('Ambiguous stage configuration reference');
      flags.set(previous[number].id!, active);
    }
    const active = current.map(stage => flags.get(stage.id!) ?? 'true');
    // The desktop loader activates stage zero if the last active stage was removed.
    if (active.length && !active.includes('true')) active[0] = 'true';
    const replacement = current.map((stage, number) => `<stage number="${number}" active="${active[number]}"/>`).join('');
    if (refs.length) {
      spans.push({ start: refs[0].start, end: refs[0].end, text: replacement });
      for (const ref of refs.slice(1)) spans.push({ start: ref.start, end: ref.end, text: '' });
    } else if (config.selfClosing) spans.push({ start: config.start, end: config.end, text: after.xml.slice(config.start, config.end).replace(/\/>$/, () => `>${replacement}</${config.name}>`) });
    else spans.push({ start: config.contentEnd, end: config.contentEnd, text: replacement });
  }
  return editArchive(after, spans);
}
export async function editComponentTree(archive: ExpandedArchive, id: string, operation: TreeOperation) {
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  const nodes = archive.parsed.components, index = nodes.findIndex(n => n.id === id), node = nodes[index];
  const controls = treeControls(nodes.map(n => ({ type: n.name, parent: nodes.indexOf(n.parent?.parent!) })), index);
  if (!node || !Object.hasOwn(controls, operation) || !controls[operation]) throw new Error('That component action is unavailable');
  const list = node.parent!, siblings = list.children, position = siblings.indexOf(node);
  const subtree = nodes.filter(n => n.start >= node.start && n.end <= node.end);
  const spans: Span[] = componentResultChanges(archive);
  let selectedId = id;
  if (operation === 'up' || operation === 'down') {
    const sibling = siblings[position + (operation === 'up' ? -1 : 1)];
    spans.push({ start: node.start, end: node.end, text: archive.xml.slice(sibling.start, sibling.end) }, { start: sibling.start, end: sibling.end, text: archive.xml.slice(node.start, node.end) });
  } else if (operation === 'duplicate') {
    if (nodes.length + subtree.length > 64) throw new Error('This editor supports at most 64 components');
    let copy = archive.xml.slice(node.start, node.end);
    for (const component of [...subtree].reverse()) {
      const idNode = component.children.find(n => n.name === 'id')!, replacement = crypto.randomUUID();
      if (component === node) selectedId = replacement;
      const span = element(archive, idNode, replacement);
      copy = copy.slice(0, span.start - node.start) + span.text + copy.slice(span.end - node.start);
    }
    spans.push({ start: list.contentEnd, end: list.contentEnd, text: copy });
  } else {
    spans.push({ start: node.start, end: node.end, text: '' });
    selectedId = (siblings[position + 1] ?? siblings[position - 1] ?? list.parent!).id!;
  }
  return { archive: await stageReferences(archive, await editArchive(archive, spans)), id: selectedId };
}
