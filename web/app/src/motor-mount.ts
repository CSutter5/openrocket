import type { ExpandedArchive, XmlNode } from '@openrocket/ork-format';
import { componentResultChanges, editArchive, element, escapeXml, type Span } from './archive-edit';
export const ignitionEvents = { automatic: 'Automatic (launch or ejection charge)', launch: 'Launch', ejectioncharge: 'Ejection charge', burnout: 'Burnout', never: 'Never' };
export interface MotorMountSettings { enabled: boolean; overhang: string; ignitionEvent: string; ignitionDelay: string }
const defaults: MotorMountSettings = { enabled: false, overhang: '0', ignitionEvent: 'automatic', ignitionDelay: '0' };
const fields = { overhang: 'overhang', ignitionEvent: 'ignitionevent', ignitionDelay: 'ignitiondelay' } as const;
export function motorMountSettings(component: XmlNode): MotorMountSettings & { reason?: string } {
  const mounts = component.children.filter(n => n.name === 'motormount'), mount = mounts[0];
  if (!mount) return { ...defaults };
  const result = { ...defaults, enabled: true, reason: mounts.length > 1 ? 'This tube has multiple motor mount definitions.' : undefined };
  for (const [key, name] of Object.entries(fields)) {
    const nodes = mount.children.filter(n => n.name === name);
    if (nodes.length > 1 || nodes.some(n => n.children.length)) result.reason = 'This motor mount has ambiguous default settings.';
    if (nodes[0]) result[key as keyof typeof fields] = nodes[0].text.trim();
  }
  return result;
}
function finite(text: string, label: string) {
  if (typeof text !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) || !Number.isFinite(Number(text))) throw new Error(`${label}: enter a finite decimal number`);
  return Number(text);
}
export async function editMotorMount(archive: ExpandedArchive, id: string, settings: MotorMountSettings) {
  const component = archive.parsed.components.find(n => n.id === id);
  if (archive.mode !== 'editable' || !component || !['bodytube', 'innertube'].includes(component.name)) throw new Error('Select an editable body or inner tube');
  if (typeof settings?.enabled !== 'boolean') throw new Error('Choose whether this tube is a motor mount');
  const current = motorMountSettings(component), mount = component.children.find(n => n.name === 'motormount');
  if (current.reason) throw new Error(current.reason);
  if (!settings.enabled) return mount ? editArchive(archive, [{ start: mount.start, end: mount.end, text: '' }, ...componentResultChanges(archive)]) : archive;
  const values = { overhang: String(finite(settings.overhang, 'Motor overhang')), ignitionEvent: settings.ignitionEvent, ignitionDelay: String(finite(settings.ignitionDelay, 'Ignition delay')) };
  if (!Object.hasOwn(ignitionEvents, values.ignitionEvent)) throw new Error('Choose a listed ignition event');
  if (Number(values.ignitionDelay) < 0) throw new Error('Ignition delay must be non-negative');
  const xml = (settings: MotorMountSettings) => Object.entries(fields).map(([key, name]) => `<${name}>${escapeXml(settings[key as keyof typeof fields])}</${name}>`).join('');
  const spans: Span[] = [];
  if (!mount || mount.selfClosing) {
    if (mount && Object.entries(fields).every(([key]) => current[key as keyof typeof fields] === values[key as keyof typeof fields])) return archive;
    const attrs = mount ? Object.entries(mount.attributes).map(([key, value]) => ` ${key}="${escapeXml(value.value)}"`).join('') : '';
    spans.push({ start: mount?.start ?? component.contentEnd, end: mount?.end ?? component.contentEnd, text: `<motormount${attrs}>${xml({ ...values, enabled: true })}</motormount>` });
  } else {
    let missing = '';
    for (const [key, name] of Object.entries(fields)) {
      const value = values[key as keyof typeof fields], before = current[key as keyof typeof fields];
      if (key === 'ignitionEvent' ? value === before : Number(value) === Number(before)) continue;
      const node = mount.children.find(n => n.name === name);
      if (node) spans.push(element(archive, node, value));
      else missing += `<${name}>${escapeXml(value)}</${name}>`;
    }
    if (!spans.length && !missing) return archive;
    // Native motor instances copy defaults at load time; retain existing per-flight ignition.
    if (values.ignitionEvent !== current.ignitionEvent || Number(values.ignitionDelay) !== Number(current.ignitionDelay)) {
      for (const motor of mount.children.filter(n => n.name === 'motor')) {
        const configId = motor.attributes.configid?.value;
        if (!configId) throw new Error('Motor assignment has no flight configuration');
        if (!mount.children.some(n => n.name === 'ignitionconfiguration' && n.attributes.configid?.value === configId)) {
          spans.push({ start: motor.end, end: motor.end, text: `<ignitionconfiguration configid="${escapeXml(configId)}"><ignitionevent>${escapeXml(current.ignitionEvent)}</ignitionevent><ignitiondelay>${escapeXml(current.ignitionDelay)}</ignitiondelay></ignitionconfiguration>` });
        }
      }
    }
    if (missing) spans.push({ start: mount.contentStart, end: mount.contentStart, text: missing });
  }
  const physical = !mount || Number(values.overhang) !== Number(current.overhang);
  return editArchive(archive, [...spans, ...(physical ? componentResultChanges(archive) : [])]);
}
