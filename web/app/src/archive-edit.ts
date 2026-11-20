import { exportArchive, importArchive, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
export interface Span { start: number; end: number; text: string }
export const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\r', '&#13;').replaceAll('\n', '&#10;').replaceAll('\t', '&#9;');
export function element(archive: ExpandedArchive, node: XmlNode, value: string, attributes = Object.fromEntries(Object.entries(node.attributes).map(([key, v]) => [key, v.value]))): Span {
  const attrs = Object.entries(attributes).map(([key, v]) => ` ${key}="${escapeXml(v)}"`).join('');
  return { start: node.start, end: node.end, text: `<${node.name}${attrs}>${escapeXml(value)}</${node.name}>` };
}
export async function editArchive(archive: ExpandedArchive, spans: Span[]) {
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  if (!spans.length) return archive;
  let xml = archive.xml, next = xml.length;
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    if (span.end > next || span.start < 0 || span.end < span.start) throw new Error('Overlapping archive changes');
    xml = xml.slice(0, span.start) + span.text + xml.slice(span.end);next = span.start;
  }
  if (xml === archive.xml) return archive;
  const exported = await exportArchive({ ...archive, changed: true, entries: archive.entries.map(e => e.path === 'rocket.ork' ? { ...e, bytes: new TextEncoder().encode(xml), sha256: '' } : e) });
  const candidate = await importArchive(exported.bytes, exported.identity);
  if (candidate.mode !== 'editable') throw new Error('Edited archive could not be safely reopened');
  return { ...candidate, original: archive.original.slice(), changed: true };
}

export function componentResultChanges(archive: ExpandedArchive): Span[] {
  const spans: Span[] = [];
  for (const simulation of archive.parsed.simulations) {
    const data = simulation.children.filter(n => n.name === 'flightdata');
    if (data.length > 1) throw new Error('Ambiguous stored flight data');
    if (!data.length) continue;
    const status = simulation.attributes.status?.value;
    // These native statuses already describe unavailable/failed historical runs.
    if (['outdated', 'cantrun', 'cant_run', 'aborted', 'notsimulated', 'not_simulated'].includes(status)) continue;
    if (!['uptodate', 'loaded', 'external'].includes(status)) throw new Error('Unrecognized stored simulation status');
    const opening = archive.xml.slice(simulation.start, simulation.contentStart);
    const match = [...opening.matchAll(/\s+([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/g)].find(m => m[1] === 'status');
    if (!match || match[3] !== status) throw new Error('Ambiguous simulation status');
    const start = simulation.start + match.index! + match[0].indexOf(match[2]) + 1;
    spans.push({ start, end: start + status.length, text: 'outdated' });
  }
  return spans;
}
