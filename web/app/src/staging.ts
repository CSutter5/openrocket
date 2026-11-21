import type { ExpandedArchive, XmlNode } from '@openrocket/ork-format';
import { componentResultChanges, editArchive, escapeXml, type Span } from './archive-edit';
import { fieldRule } from './components';
import { ignitionEvents } from './motor-mount';
export interface SeparationSettings { event: string; altitude: string; delay: string }
export interface StageSettings {
  id: string; name: string; number: number; active: boolean;
  separation: SeparationSettings;
  motors: { id: string; name: string; event: string; delay: string }[];
}
const text = (node: XmlNode | undefined, name: string, fallback: string) => node?.children.find(n => n.name === name)?.text.trim() ?? fallback;
export function stageSettings(archive: ExpandedArchive, configurationId?: string): StageSettings[] {
  const root = archive.parsed.components[0], config = root?.children.find(n => n.name === 'motorconfiguration' && n.attributes.configid?.value === configurationId);
  return archive.parsed.components.filter(n => n.name === 'stage' && n.parent?.parent === root).map((stage, number) => {
    const override = stage.children.find(n => n.name === 'separationconfiguration' && n.attributes.configid?.value === configurationId);
    return { id: stage.id!, name: stage.label ?? 'Stage', number, active: config?.children.find(n => n.name === 'stage' && Number(n.attributes.number?.value) === number)?.attributes.active?.value !== 'false',
      separation: { event: text(override, 'separationevent', text(stage, 'separationevent', 'ejection')), altitude: text(override, 'separationaltitude', text(stage, 'separationaltitude', '200')), delay: text(override, 'separationdelay', text(stage, 'separationdelay', '0')) },
      motors: archive.parsed.components.filter(n => {
        let parent: XmlNode | undefined = n.parent;while (parent && parent !== stage) parent = parent.parent;
        return parent === stage && n.children.some(c => c.name === 'motormount');
      }).map(n => {
        const mount = n.children.find(c => c.name === 'motormount')!, ignition = mount.children.find(c => c.name === 'ignitionconfiguration' && c.attributes.configid?.value === configurationId);
        return { id: n.id!, name: n.label ?? n.name, event: text(ignition, 'ignitionevent', text(mount, 'ignitionevent', 'automatic')), delay: text(ignition, 'ignitiondelay', text(mount, 'ignitiondelay', '0')) };
      }) };
  });
}
function decimal(value: string, name: string, signed = false) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value)) || !signed && Number(value) < 0 || Math.abs(Number(value)) > 1e12) throw new Error(`${name}: enter a finite ${signed ? '' : 'non-negative '}decimal number`);
  return String(Number(value));
}
function overrideSpan(archive: ExpandedArchive, parent: XmlNode, name: string, id: string, values: Record<string, string>): Span {
  const overrides = parent.children.filter(n => n.name === name && n.attributes.configid?.value === id);
  if (overrides.length > 1 || overrides.some(n => Object.keys(n.attributes).some(k => k !== 'configid') || n.text.trim() || n.children.length !== Object.keys(values).length || n.children.some(c => !(c.name in values) || c.children.length || Object.keys(c.attributes).length) || new Set(n.children.map(c => c.name)).size !== Object.keys(values).length)) throw new Error('Ambiguous staging override');
  const xml = `<${name} configid="${escapeXml(id)}">${Object.entries(values).map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`).join('')}</${name}>`;
  if (overrides[0]) return { start: overrides[0].start, end: overrides[0].end, text: xml };
  if (parent.selfClosing) throw new Error('Incomplete staging settings');
  return { start: parent.contentEnd, end: parent.contentEnd, text: xml };
}
export async function editStaging(archive: ExpandedArchive, configurationId: string, settings: StageSettings) {
  if (archive.mode !== 'editable' || archive.parsed.components.some(n => ['podset', 'parallelstage'].includes(n.name))) throw new Error('Stage settings require editable axial stages');
  const configs = archive.parsed.components[0].children.filter(n => n.name === 'motorconfiguration' && n.attributes.configid?.value === configurationId);
  if (configs.length !== 1) throw new Error('Select a flight configuration');
  const stages = stageSettings(archive, configurationId), current = stages.find(s => s.id === settings.id);
  if (!current || typeof settings.active !== 'boolean') throw new Error('Select an axial stage');
  const stage = archive.parsed.components.find(n => n.id === settings.id)!, spans: Span[] = [];
  if (settings.active !== current.active) {
    if (!settings.active && stages.filter(s => s.active).length < 2) throw new Error('At least one stage must remain active');
    const refs = configs[0].children.filter(n => n.name === 'stage' && Number(n.attributes.number?.value) === current.number);
    if (refs.length !== 1 || refs[0].children.length || refs[0].text.trim() || Object.keys(refs[0].attributes).some(k => !['number', 'active'].includes(k))) throw new Error('Ambiguous stage reference');
    spans.push({ start: refs[0].start, end: refs[0].end, text: `<stage number="${current.number}" active="${settings.active}"/>` });
  }
  const separation = settings.separation;
  if (!fieldRule('stage', 'separationevent')?.values?.includes(separation.event)) throw new Error('Choose a listed separation event');
  const altitude = decimal(separation.altitude, 'Separation altitude', true), delay = decimal(separation.delay, 'Separation delay');
  if (current.number > 0 && (separation.event !== current.separation.event || Number(altitude) !== Number(current.separation.altitude) || Number(delay) !== Number(current.separation.delay))) spans.push(overrideSpan(archive, stage, 'separationconfiguration', configurationId, { separationevent: separation.event, separationaltitude: altitude, separationdelay: delay }));
  const seen = new Set<string>();
  for (const motor of settings.motors) {
    const previous = current.motors.find(m => m.id === motor.id);
    if (!previous || seen.has(motor.id)) throw new Error('Select a motor mount in this stage');seen.add(motor.id);
    if (!Object.hasOwn(ignitionEvents, motor.event)) throw new Error('Choose a listed ignition event');
    const delay = decimal(motor.delay, 'Ignition delay');
    if (previous.event === motor.event && Number(previous.delay) === Number(delay)) continue;
    const mount = archive.parsed.components.find(n => n.id === motor.id)!.children.find(n => n.name === 'motormount')!;
    spans.push(overrideSpan(archive, mount, 'ignitionconfiguration', configurationId, { ignitionevent: motor.event, ignitiondelay: delay }));
  }
  return spans.length ? editArchive(archive, [...spans, ...componentResultChanges(archive)]) : archive;
}
