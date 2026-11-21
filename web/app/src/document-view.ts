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
import { stageSettings } from './staging';
import { motorMountSettings } from './motor-mount';
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);
export async function describe(current: ExpandedArchive, name: string, lastExport: string, configurationId: string | undefined): Promise<DocumentView> {
  const nodes = current.parsed.components, stages = stageSettings(current, configurationId);
  try { await resolveCatalogMotors(current); } catch { /* File inspection remains available when catalog assets are unavailable. */ }
  let nativeExterior: import('./drawing').Drawing | null = null, exteriorIds: string[] = [];
  let centers: DocumentView['stability'], internals: import('./drawing').InternalShape[] = [];
  try { const result = JSON.parse(stability(importedInput(current, configurationId, true).model)) as DocumentView['stability'] & { internals: import('./drawing').InternalShape[]; exterior: import('./drawing').Drawing | null; exteriorIds: string[] };
    ({ internals, exterior: nativeExterior, exteriorIds, ...centers } = result); }
  catch (error) { centers = { cg: null, cp: null, reason: failure(error) }; }
  // Native UUID serialization is lowercase; selection keeps the archive's ID spelling.
  internals = internals.map(shape => ({ ...shape, id: nodes.find(node => node.id?.toLowerCase() === shape.id)?.id ?? shape.id }));
  const drawing = nativeExterior && nodes.filter(n => n.name === 'stage').length > 1 ? {
    ...nativeExterior, componentIndices: exteriorIds.map(id => nodes.findIndex(n => n.id?.toLowerCase() === id)),
    omitted: nodes.filter(n => {
      let stage = n.parent;while (stage && stage.name !== 'stage') stage = stage.parent;
      return !['rocket', 'stage'].includes(n.name) && stages.some(s => s.id === stage?.id && s.active) && !exteriorIds.includes(n.id?.toLowerCase() ?? '');
    }).map(n => `${n.label ?? n.name}: ${n.name} (interior or unsupported shape)`),
  } : rocketDrawing(current);
  if (stages.length > 1 && drawing.error && centers.reason) drawing.error = `Drawing unavailable: ${centers.reason}`;
  drawing.internals = internals;
  for (const shape of internals) {
    drawing.minX = Math.min(drawing.minX, shape.x);
    drawing.maxX = Math.max(drawing.maxX, shape.x + shape.length);
    drawing.radius = Math.max(drawing.radius, Math.abs(shape.y) + shape.radius);
  }
  const visible = new Set(internals.map(shape => shape.id));
  drawing.omitted = drawing.omitted.filter(label => !nodes.some(node => node.id && visible.has(node.id) && label === `${node.label ?? node.name}: ${node.name} (interior or unsupported shape)`));
  return {
    stability: centers, stages,
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
      let stage = n.parent;while (stage && stage.name !== 'stage') stage = stage.parent;
      const name = stages.length > 1 ? `${stages.find(s => s.id === stage?.id)?.number} · ${stage?.label ?? 'Stage'} / ${n.label ?? n.name}` : n.label ?? n.name;
      return { id: n.id!, name, diameter, length, usedGroups: [...new Set(matchedGroups)], assignments };
    }),
    flightSupport: flightSupport(current, configurationId), flightConfigurations: flightConfigurations(current), flightConfigurationId: configurationId, drawing, filename: name, mode: current.mode, diagnostics: current.diagnostics,
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
