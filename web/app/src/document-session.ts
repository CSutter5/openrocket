import { componentNames, renameComponent, importArchive, exportArchive, type ExpandedArchive } from '@openrocket/ork-format';
import { tubeRadiusInput, applyTubeRadius, radiusSimulationEffects, validateTubeRadiusEdit, type TubeRadiusInput } from '../../packages/ork-format/src/radius.js';
import { tubePropertyInput, applyTubeProperty } from '../../packages/ork-format/src/tube-properties.js';
import { tubePropertyEdit, radiusEdit, presetRadiusEdit, automaticRingRadiusEdit, siblingRingRadiusEdit } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { createConfiguration, renameConfiguration, deleteConfiguration } from './simulation/configurations';
import { assignMotor } from './simulation/assign-motor';
import { editComponentTree } from './component-tree';
import { editComponentProperty, editComponentProperties } from './component-properties';
import { editMotorMount } from './motor-mount';
import { addComponent, newRocket } from './components';
import type { Action, Intrinsic, Reply } from './model';

import { flightConfigurations } from './simulation/input';
import { savedSimulation } from './simulation/saved';
import { bindFlight } from './simulation/provenance';

export function intrinsic(tube: TubeRadiusInput, value: number): { before: Intrinsic; after: Intrinsic } {
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
export function createDocumentSession<V>(describe: (archive: ExpandedArchive, filename: string, exportHash: string, configurationId: string | undefined) => Promise<V>, fetchCurve: typeof fetch = fetch) {
  let archive: ExpandedArchive | undefined;
  let filename = '', exportHash = '';
  let selectedConfigurationId: string | undefined;
  async function execute(action: Action): Promise<Omit<Reply, 'view'> & { view: V }> {
    if (action.type === 'import' || action.type === 'new' || action.type === 'sync') {
      const candidate = action.type === 'new' ? await newRocket() : await importArchive(action.bytes, action.type === 'sync' ? action.identity : undefined);
      const importedFilename = action.type === 'new' ? 'Untitled.ork' : action.filename;
      // Build the view before publication, so a failed replacement retains the accepted archive.
      const choices = flightConfigurations(candidate);
      const configurationId = action.type === 'sync' && choices.some(c => c.id === selectedConfigurationId) ? selectedConfigurationId : choices.find(c => c.isDefault)?.id;
      const view = await describe(candidate, importedFilename, candidate.identity.archiveHash, configurationId);
      selectedConfigurationId = configurationId;
      archive = candidate; filename = importedFilename; exportHash = candidate.identity.archiveHash;
      return { view, notice: action.type === 'new' ? 'New rocket created.' : 'Archive opened. Original upload retained in memory.' };
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
    let selectedId: string | undefined;
    if (action.type === 'componentProperty' || action.type === 'componentProperties' || action.type === 'componentTree') {
      if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before component edit; try again');
      if (action.type === 'componentProperties') {
        candidate = await editComponentProperties(archive, action.id, action.changes);
        if (action.motorMount !== undefined) candidate = await editMotorMount(candidate, action.id, action.motorMount);
        const radius = action.changes.find(change => change.name === 'radius' && !change.remove);
        if (radius && Number.isFinite(Number(radius.value)) && archive.parsed.components.find(n => n.id === action.id)?.name === 'bodytube') {
          let input: TubeRadiusInput | undefined;
          try { input = tubeRadiusInput(archive, action.id); } catch { /* Automatic/unsupported graphs retain the raw editing boundary. */ }
          if (input) validateTubeRadiusEdit(archive, input, intrinsic(input, Number(radius.value)).after);
        }
        const currentName = componentNames(candidate).find(n => n.id === action.id)?.name;
        if (currentName !== action.name) candidate = await renameComponent(candidate, action.id, currentName!, action.name);
        if (candidate !== archive) notice = 'Component updated.';
      } else if (action.type === 'componentProperty') {
        candidate = await editComponentProperty(archive, action.id, action.key, action.value, action.attributes);
        const component = archive.parsed.components.find(n => n.id === action.id);
        if (candidate !== archive && component?.name === 'bodytube' && component.children[action.key]?.name === 'radius' && Number.isFinite(Number(action.value))) {
          let input: TubeRadiusInput | undefined;
          try { input = tubeRadiusInput(archive, action.id); } catch { /* Raw archive fields also cover automatic tubes outside the original radius controls. */ }
          if (input) validateTubeRadiusEdit(archive, input, intrinsic(input, Number(action.value)).after);
        }
        if (candidate !== archive) notice = 'Component property updated.';
      } else {
        const edited = await editComponentTree(archive, action.id, action.operation);
        candidate = edited.archive;selectedId = edited.id;notice = 'Component tree updated.';
      }
    } else if (action.type === 'addComponent') {
      if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before component creation; try again');
      const created = await addComponent(archive, action.selectedId, action.componentType, action.position);
      candidate = created.archive; selectedId = created.id; notice = 'Component created. Affected stored results are outdated; series retained.';
    } else if (action.type === 'createConfiguration') {
      const created = await createConfiguration(archive, action.name, action.mountId, action.motorKey, action.delay, fetchCurve);
      candidate = created.archive; nextConfigurationId = created.configurationId; notice = 'Configuration and linked simulation created.';
    } else if (action.type === 'renameConfiguration') {
      candidate = await renameConfiguration(archive, action.configurationId, action.name); notice = 'Configuration renamed.';
    } else if (action.type === 'deleteConfiguration') {
      candidate = await deleteConfiguration(archive, action.configurationId);
      if (nextConfigurationId === action.configurationId) nextConfigurationId = flightConfigurations(candidate).find(c => c.isDefault)?.id;
      notice = 'Configuration and linked simulations deleted.';
    } else if (action.type === 'assignMotor') {
      if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before motor assignment; choose again');
      candidate = await assignMotor(archive, action.configurationId, action.mountId, action.motorKey, action.delay, fetchCurve);
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
    return { view, notice, selectedId, configurationId: nextConfigurationId };
  }
  return { execute, snapshot: async () => {
    if (!archive) throw new Error('Open an archive first');
    const exported = await exportArchive(archive);
    return { bytes: Array.from(exported.bytes), identity: exported.identity, filename };
  } };
}
