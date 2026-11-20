import { exportArchive, importArchive, LIMITS, type ExpandedArchive, type XmlNode } from '@openrocket/ork-format';
import { assignMotor } from './assign-motor';
import { settings } from './provenance';
import { simulationStatusChanges } from '../../../packages/ork-format/src/radius.js';
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\r', '&#13;');
type Span = { start: number; end: number; text: string };
function configuration(archive: ExpandedArchive, id: string) {
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  const matches = archive.parsed.components[0]?.children.filter(n => n.name === 'motorconfiguration' && n.attributes.configid?.value === id) ?? [];
  if (matches.length !== 1) throw new Error('Unknown or ambiguous configuration');
  if (Object.keys(matches[0].attributes).some(key => !['configid', 'default'].includes(key))) throw new Error('Unsupported configuration attributes');
  return matches[0];
}
function validName(name: string) {
  if (typeof name !== 'string' || !name.trim() || name.length > LIMITS.name || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(name)) throw new Error('Enter a non-empty configuration name');
}
async function publish(archive: ExpandedArchive, spans: Span[], simulationIds = archive.identity.simulations) {
  let xml = archive.xml;
  for (const span of spans.sort((a, b) => b.start - a.start)) xml = xml.slice(0, span.start) + span.text + xml.slice(span.end);
  const candidate = { ...archive, changed: true, identity: { ...archive.identity, simulations: simulationIds }, entries: archive.entries.map(e => e.path === 'rocket.ork' ? { path: e.path, bytes: new TextEncoder().encode(xml), sha256: '' } : e) };
  const exported = await exportArchive(candidate), accepted = await importArchive(exported.bytes, exported.identity);
  if (accepted.mode !== 'editable') throw new Error('Configuration changes could not be safely reopened');
  return { ...accepted, original: archive.original.slice(), changed: true };
}
function append(archive: ExpandedArchive, parent: XmlNode, xml: string): Span {
  if (parent.selfClosing) return { start: parent.start, end: parent.end, text: archive.xml.slice(parent.start, parent.end).replace(/\/>$/, () => `>${xml}</${parent.name}>`) };
  return { start: parent.contentEnd, end: parent.contentEnd, text: xml };
}
export async function renameConfiguration(archive: ExpandedArchive, id: string, name: string) {
  validName(name);const node = configuration(archive, id), names = node.children.filter(n => n.name === 'name');
  if (names.length > 1 || names.some(n => n.children.length || Object.keys(n.attributes).length)) throw new Error('Ambiguous configuration name');
  if (names[0]?.text === name) return archive;
  return publish(archive, names.length ? [{ start: names[0].start, end: names[0].end, text: `<name>${escape(name)}</name>` }] : [append(archive, node, `<name>${escape(name)}</name>`)]);
}
export async function deleteConfiguration(archive: ExpandedArchive, id: string) {
  const target = configuration(archive, id), spans: Span[] = [{ start: target.start, end: target.end, text: '' }];
  const removedSimulations = new Set<number>(), removedNodes = new Set<XmlNode>();
  archive.parsed.simulations.forEach((sim, index) => {
    const conditions = sim.children.filter(n => n.name === 'conditions'), links = conditions.flatMap(n => n.children.filter(n => n.name === 'configid'));
    if (links.some(n => n.text.trim() === id)) {
      if (conditions.length !== 1 || links.length !== 1) throw new Error('Ambiguous simulation configuration link');
      spans.push({ start: sim.start, end: sim.end, text: '' });removedSimulations.add(index);removedNodes.add(sim);
    }
  });
  const root = archive.parsed.components[0];
  for (const node of archive.parsed.nodes.filter(n => n.attributes.configid?.value === id && n !== target)) {
    if (!['motor', 'ignitionconfiguration', 'deploymentconfiguration', 'separationconfiguration'].includes(node.name)) throw new Error(`Cannot remove unknown configuration reference ${node.name}`);
    spans.push({ start: node.start, end: node.end, text: '' });
  }
  for (const node of archive.parsed.nodes.filter(n => n.name === 'configid' && n.text.trim() === id)) {
    let parent = node.parent;while (parent && !removedNodes.has(parent)) parent = parent.parent;
    if (!parent) throw new Error('Cannot remove unknown configuration reference configid');
  }
  const remaining = root.children.filter(n => n.name === 'motorconfiguration' && n !== target);
  if (target.attributes.default?.value === 'true' && remaining.length) {
    configuration(archive, remaining[0].attributes.configid?.value);
    const replacement = remaining[0], opening = archive.xml.slice(replacement.start, replacement.contentStart);
    const text = replacement.attributes.default ? opening.replace(/\bdefault\s*=\s*(["']).*?\1/, 'default="true"') : opening.replace(/\/>$|>$/, match => ` default="true"${match}`);
    spans.push({ start: replacement.start, end: replacement.contentStart, text });
  }
  return publish(archive, spans, archive.identity.simulations.filter((_, i) => !removedSimulations.has(i)));
}
function newSimulation(id: string, name: string) {
  const fields = { configid: id, launchrodlength: settings.rodLength, launchintowind: false, launchrodangle: 0, launchroddirection: 90,
    windaverage: settings.wind, windturbulence: settings.windDeviation / settings.wind, winddirection: Math.PI / 2,
    windmodeltype: 'Average', launchaltitude: settings.elevation, launchlatitude: settings.latitude, launchlongitude: settings.longitude,
    geodeticmethod: 'spherical', simulationsteppermethod: 'rk4', randomseed: settings.seed, timestep: settings.timeStep, maxtime: 600 };
  return `<simulation status="not_simulated"><name>${escape(name)}</name><simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator><conditions>` +
    Object.entries(fields).map(([key, value]) => `<${key}>${value}</${key}>`).join('') +
    `<wind model="average"><speed>${settings.wind}</speed><direction>${Math.PI / 2}</direction><standarddeviation>${settings.windDeviation}</standarddeviation></wind><atmosphere model="isa"/><gravity model="wgs"/></conditions></simulation>`;
}
export async function createConfiguration(archive: ExpandedArchive, name: string, mountId: string, motorKey: string, delay: string) {
  validName(name);
  if (archive.mode !== 'editable') throw new Error('This archive is read-only');
  const root = archive.parsed.components[0], configurations = root.children.filter(n => n.name === 'motorconfiguration');
  if (configurations.length >= 16) throw new Error('This editor supports up to 16 configurations');
  const stages = archive.parsed.components.filter(n => ['stage', 'parallelstage', 'podset'].includes(n.name));
  if (stages.length !== 1 || stages[0].name !== 'stage') throw new Error('Creating configurations currently requires one axial stage');
  const id = crypto.randomUUID(), config = `<motorconfiguration configid="${id}"${configurations.length ? '' : ' default="true"'}><name>${escape(name)}</name><stage number="0" active="true"/></motorconfiguration>`;
  const before = root.children.find(n => n.name === 'subcomponents')?.start ?? root.contentEnd;
  const spans = [{ start: before, end: before, text: config }, ...simulationStatusChanges(archive, () => true).map(c => ({ start: c.start, end: c.end, text: c.after }))];
  const container = archive.parsed.nodes.find(n => n.name === 'openrocket')!, lists = container.children.filter(n => n.name === 'simulations');
  if (lists.length > 1 || lists[0] && Object.keys(lists[0].attributes).length) throw new Error('Ambiguous simulation list');
  const usedNames = new Set(archive.parsed.simulations.map(n => n.children.find(c => c.name === 'name')?.text));
  let number = 1;while (usedNames.has(`Simulation ${number}`)) number++;
  const simulation = newSimulation(id, `Simulation ${number}`);
  spans.push(lists.length ? append(archive, lists[0], simulation) : { start: root.end, end: root.end, text: `<simulations>${simulation}</simulations>` });
  const candidate = await publish(archive, spans, [...archive.identity.simulations, { id: crypto.randomUUID() }]);
  return { archive: await assignMotor(candidate, id, mountId, motorKey, delay), configurationId: id };
}
