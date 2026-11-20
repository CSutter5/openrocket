import { sha256, componentNames, renameComponent, importArchive, exportArchive, type ExpandedArchive } from '@openrocket/ork-format';
import { tubeRadiusInput, applyTubeRadius, radiusSimulationEffects, type TubeRadiusInput } from '../../packages/ork-format/src/radius.js';
import { tubePropertyInput, applyTubeProperty } from '../../packages/ork-format/src/tube-properties.js';
import { tubePropertyEdit, radiusEdit, presetRadiusEdit, automaticRingRadiusEdit, siblingRingRadiusEdit } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { createConfiguration, renameConfiguration, deleteConfiguration } from './simulation/configurations';
import { numeric } from '../../packages/ork-format/src/radius.js';
import { assignMotor } from './simulation/assign-motor';
import { motors, resolveCatalogMotors } from './simulation/motor-catalog';
import { rocketDrawing } from './drawing';
import type { Action, DocumentView, Intrinsic, Reply } from './model';

import { flightSupport, flightConfigurations } from './simulation/input';
import { savedSimulations, savedSimulation } from './simulation/saved';
import { bindFlight } from './simulation/provenance';

let archive: ExpandedArchive | undefined;
let filename = '', exportHash = '';
let selectedConfigurationId: string | undefined;
function intrinsic(tube: TubeRadiusInput, value: number): { before: Intrinsic; after: Intrinsic } {
  return JSON.parse(tube.ring?.sibling
    ? siblingRingRadiusEdit(tube.preset?.key ?? '', tube.preset?.digest ?? '', tube.length, tube.radius, tube.thickness,
      tube.filled, tube.density, tube.ring.length, tube.ring.density, tube.ring.axialOffset, tube.configurationIds!.join(';'), value,
      tube.ring.sibling.length, tube.ring.sibling.outerRadius, tube.ring.sibling.thickness, tube.ring.sibling.density, tube.ring.sibling.axialOffset, tube.ring.precedingNoseLength!)
    : tube.ring
    ? automaticRingRadiusEdit(tube.preset?.key ?? '', tube.preset?.digest ?? '', tube.length, tube.radius, tube.thickness,
      tube.filled, tube.density, tube.ring.length, tube.ring.innerRadius, tube.ring.density, tube.ring.axialOffset, tube.configurationIds!.join(';'), value)
    : tube.preset
    ? presetRadiusEdit(tube.preset.key, tube.preset.digest, tube.length, tube.radius, tube.thickness, tube.filled, tube.density, value)
    : radiusEdit(tube.length, tube.radius, tube.thickness, tube.filled, tube.density, value));
}
async function describe(current: ExpandedArchive, name: string, lastExport: string, configurationId: string | undefined): Promise<DocumentView> {
  const nodes = current.parsed.components;
  try { await resolveCatalogMotors(current); } catch { /* File inspection remains available when catalog assets are unavailable. */ }
  return {
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
        properties: node.children.filter(n => !n.children.length && !['name', 'id'].includes(n.name))
          .map(n => ({ name: n.name, value: n.text.slice(0, 200) || '(empty)' })) };
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
function failure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
async function execute(action: Action): Promise<Reply> {
  if (action.type === 'import') {
    const candidate = await importArchive(action.bytes);
    // Build the view before publication, so a failed replacement retains the accepted archive.
    const configurationId = flightConfigurations(candidate).find(c => c.isDefault)?.id;
    const view = await describe(candidate, action.filename, candidate.identity.archiveHash, configurationId);
    selectedConfigurationId = configurationId;
    archive = candidate; filename = action.filename; exportHash = candidate.identity.archiveHash;
    return { view, notice: 'Archive opened. Original upload retained in memory.' };
  }
  if (!archive) throw new Error('Open an archive first');
  if (action.type === 'flightConfiguration') {
    if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before configuration selection; select again');
    if (!flightConfigurations(archive).some(c => c.id === action.configurationId)) throw new Error('Unknown flight configuration');
    const view = await describe(archive, filename, exportHash, action.configurationId);
    selectedConfigurationId = action.configurationId;
    return { view, notice: 'Session flight configuration selected. Archive and stored results retained.' };
  }
  if (action.type === 'flightSnapshot') {
    if (!action.simulationId && action.configurationId !== selectedConfigurationId) throw new Error('Flight configuration changed before snapshot; run again');
    if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before simulation snapshot; run again');
    if (action.simulationId && savedSimulation(archive, action.simulationId).configurationId !== action.configurationId) throw new Error('Saved simulation configuration mismatch');
    const bound = await bindFlight(archive, action.integrator, action.configurationId, action.simulationId);
    const exported = await exportArchive(archive);
    return { view: await describe(archive, filename, exportHash, selectedConfigurationId), notice: 'Exact accepted archive captured for simulation.',
      snapshot: { bytes: exported.bytes, identity: exported.identity, provenance: bound.provenance, inputHash: bound.inputHash } };
  }
  if (action.type === 'export') {
    const exported = await exportArchive(archive);
    const view = await describe(archive, filename, exported.identity.archiveHash, selectedConfigurationId);
    exportHash = exported.identity.archiveHash;
    return { view, bytes: exported.bytes, notice: 'Download prepared locally. Check your browser downloads; this is not cloud or durable save confirmation.' };
  }
  let candidate = archive, nextConfigurationId = selectedConfigurationId, notice = 'No change; accepted document retained.';
  if (['createConfiguration', 'renameConfiguration', 'deleteConfiguration'].includes(action.type) && archive.identity.archiveHash !== (action as { expectedHash: string }).expectedHash) throw new Error('Document changed before configuration edit; try again');
  if (action.type === 'createConfiguration') {
    const created = await createConfiguration(archive, action.name, action.mountId, action.motorKey, action.delay);
    candidate = created.archive; nextConfigurationId = created.configurationId; notice = 'Configuration and linked simulation created.';
  } else if (action.type === 'renameConfiguration') {
    candidate = await renameConfiguration(archive, action.configurationId, action.name); notice = 'Configuration renamed.';
  } else if (action.type === 'deleteConfiguration') {
    candidate = await deleteConfiguration(archive, action.configurationId);
    if (nextConfigurationId === action.configurationId) nextConfigurationId = flightConfigurations(candidate).find(c => c.isDefault)?.id;
    notice = 'Configuration and linked simulations deleted.';
  } else if (action.type === 'assignMotor') {
    if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before motor assignment; choose again');
    candidate = await assignMotor(archive, action.configurationId, action.mountId, action.motorKey, action.delay);
    if (candidate !== archive) notice = 'Motor assigned to the selected configuration. Affected stored results are outdated; existing series retained.';
  } else if (action.type === 'rename') {
    const component = componentNames(archive).find(c => c.id === action.id);
    if (!component || component.name !== action.expected) throw new Error('Name changed; select the component again');
    if (action.value !== component.name) {
      candidate = await renameComponent(archive, action.id, action.expected, action.value);
      // Refresh the archive hash used for changed-since-export feedback.
      const exported = await exportArchive(candidate);
      candidate = { ...candidate, identity: exported.identity };
      notice = 'Name updated. Other XML and attachments preserved.';
    }
  } else if (action.type === 'tubeProperty') {
    const input = tubePropertyInput(archive, action.id);
    if (input[action.property] !== action.expected) throw new Error('Property changed; select the component again');
    const effects = JSON.parse(tubePropertyEdit(input.preset?.key ?? '', input.preset?.digest ?? '', input.length, input.radius, input.thickness, input.filled, input.density, action.property, action.value));
    candidate = await applyTubeProperty(archive, input, action.property, action.value, effects.after, effects.functionalChange);
    if (candidate !== archive) notice = `Java ${action.property} edit accepted. Affected stored results are outdated; series retained.`;
  } else if (action.type === 'radius') {
    if (!Number.isFinite(action.value) || action.value <= 0 || action.value > 1) throw new Error('Outer radius must be a finite number greater than 0 and at most 1 m');
    const input = tubeRadiusInput(archive, action.id);
    if (input.radius !== action.expected) throw new Error('Radius changed; select the component again');
    const effects = intrinsic(input, action.value);
    const invalidations = radiusSimulationEffects(archive, input, effects.after);
    candidate = await applyTubeRadius(archive, input, effects.after);
    if (candidate !== archive) notice = `Java radius edit accepted. ${invalidations.length} stored result(s) marked outdated; series retained.`;
  }
  const view = await describe(candidate, filename, exportHash, nextConfigurationId);
  archive = candidate; selectedConfigurationId = nextConfigurationId;
  return { view, notice };
}
// Serialize asynchronous codec operations; never publish an intermediate candidate.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; action: Action }>) => {
  queue = queue.then(async () => {
    try { self.postMessage({ id: data.id, result: await execute(data.action) }); }
    catch (error) { self.postMessage({ id: data.id, error: failure(error) }); }
  });
};
