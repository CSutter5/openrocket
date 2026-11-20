import { sha256, componentNames, type ExpandedArchive } from '@openrocket/ork-format';
import { tubeRadiusInput, radiusSimulationEffects, numeric } from '../../packages/ork-format/src/radius.js';
import { tubePropertyInput } from '../../packages/ork-format/src/tube-properties.js';
import { motors, resolveCatalogMotors } from './simulation/motor-catalog';
import { stability } from '../../engine-adapter/build/generated/teavm/js/openrocket-g1-engine.js';
import { importedInput } from './simulation/imported';
import { rocketDrawing } from './drawing';
import { flightSupport, flightConfigurations } from './simulation/input';
import { savedSimulations } from './simulation/saved';
import { intrinsic } from './document-session';
import type { DocumentView } from './model';
import { motorMountSettings } from './motor-mount';
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
export async function describe(current: ExpandedArchive, name: string, lastExport: string, configurationId: string | undefined): Promise<DocumentView> {
  const nodes = current.parsed.components;
  try { await resolveCatalogMotors(current); } catch { /* File inspection remains available when catalog assets are unavailable. */ }
  let centers: DocumentView['stability'];
  try { centers = JSON.parse(stability(importedInput(current, configurationId, true).model)); }
  catch (error) { centers = { cg: null, cp: null, reason: failure(error) }; }
  return {
    stability: centers,
    motorMounts: nodes.filter(n => n.id && ['bodytube', 'innertube'].includes(n.name) && n.children.some(c => c.name === 'motormount')).map(n => {
      let diameter: number | undefined, length: number | undefined;
      const value = (name: string) => numeric(n.children.find(c => c.name === name)?.text.trim() ?? '', name);
      try { diameter = n.children.find(c => c.name === 'filled')?.text.trim() === 'true' ? 0 : 2 * Math.max(0, value(n.name === 'bodytube' ? 'radius' : 'outerradius') - value('thickness')); } catch { /* Automatic dimensions are not inferred. */ }
      try { length = value('length'); } catch { /* Missing dimensions leave their fit filter disabled. */ }
      const matchedGroups: number[] = [];
      const assignments = n.children.find(c => c.name === 'motormount')!.children.filter(c => c.name === 'motor').map(ref => {
        const text = (name: string) => ref.children.find(c => c.name === name)?.text.trim();
        const manufacturer = (text('manufacturer') ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const motor = motors.find(m => m.digest === text('digest') && m.designation.toLowerCase() === text('designation')?.toLowerCase() && m.diameter === Number(text('diameter')) && m.length === Number(text('length')) && m.manufacturerNames.includes(manufacturer));
        if (motor) matchedGroups.push(motor.group);
        return { configurationId: ref.attributes.configid?.value ?? '', motorKey: motor?.key, delay: text('delay') ?? 'none' };
      });
      return { id: n.id!, name: n.label ?? n.name, diameter, length, usedGroups: [...new Set(matchedGroups)], assignments };
    }),
    flightSupport: flightSupport(current, configurationId), flightConfigurations: flightConfigurations(current), flightConfigurationId: configurationId, drawing: rocketDrawing(current), filename: name, mode: current.mode, diagnostics: current.diagnostics,
    identitySidecarHash: await sha256(new TextEncoder().encode(JSON.stringify(current.identity))),
    hash: current.identity.archiveHash, dirty: current.identity.archiveHash !== lastExport,
    components: componentNames(current).map((component, index) => {
      const node = nodes[index];
      const view: DocumentView['components'][number] = { ...component, parent: nodes.indexOf(node.parent?.parent!),
        ...(['bodytube', 'innertube'].includes(node.name) ? { motorMount: motorMountSettings(node) } : {}),
        properties: node.children.map((n, key) => ({ n, key })).filter(({ n }) => !n.children.length && !['name', 'id', 'subcomponents'].includes(n.name))
          .map(({ n, key }) => ({ key, name: n.name, value: n.text, attributes: Object.fromEntries(Object.entries(n.attributes).map(([key, v]) => [key, v.value])) })) };
      try {
        const input = tubeRadiusInput(current, component.id ?? '');
        const state = intrinsic(input, input.radius).after;
        radiusSimulationEffects(current, input, state);
        view.tube = { input, state };
      } catch (error) { view.radiusReason = component.type === 'bodytube' ? failure(error) : 'Only supported BodyTube outer radius can be edited. Other types are read-only.'; }
      if (view.tube) {
        try { tubePropertyInput(current, component.id!); view.extraProperties = true; }
        catch (error) { view.extraPropertiesReason = failure(error); }
      }
      return view;
    }),
    simulations: savedSimulations(current).map(s => ({ ...s, support: flightSupport(current, s.configurationId) })),
  };
}
