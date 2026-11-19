import { componentNames, renameComponent, importArchive, exportArchive, type ExpandedArchive } from '@openrocket/ork-format';
import { tubeRadiusInput, applyTubeRadius, radiusSimulationEffects, type TubeRadiusInput } from '../../packages/ork-format/src/radius.js';
import { tubePropertyInput, applyTubeProperty } from '../../packages/ork-format/src/tube-properties.js';
import { tubePropertyEdit, radiusEdit, presetRadiusEdit, automaticRingRadiusEdit, siblingRingRadiusEdit } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
import { rocketDrawing } from './drawing';
import type { Action, DocumentView, Intrinsic, Reply } from './model';

import { flightSupport } from './simulation/input';
import { bindFlight } from './simulation/provenance';

let archive: ExpandedArchive | undefined;
let filename = '', exportHash = '';
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
function describe(current: ExpandedArchive, name: string, lastExport: string): DocumentView {
  const nodes = current.parsed.components;
  return {
    flightSupport: flightSupport(current), drawing: rocketDrawing(current), filename: name, mode: current.mode, diagnostics: current.diagnostics,
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
    simulations: current.parsed.simulations.map(n => ({ name: n.children.find(c => c.name === 'name')?.text ?? '(unnamed)',
      status: n.attributes.status?.value ?? 'unspecified' })),
  };
}
function failure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
async function execute(action: Action): Promise<Reply> {
  if (action.type === 'import') {
    const candidate = await importArchive(action.bytes);
    // Build the view before publication, so a failed replacement retains the accepted archive.
    const view = describe(candidate, action.filename, candidate.identity.archiveHash);
    archive = candidate; filename = action.filename; exportHash = candidate.identity.archiveHash;
    return { view, notice: 'Archive opened. Original upload retained in memory.' };
  }
  if (!archive) throw new Error('Open an archive first');
  if (action.type === 'flightSnapshot') {
    if (archive.identity.archiveHash !== action.expectedHash) throw new Error('Document changed before simulation snapshot; run again');
    const bound = await bindFlight(archive, action.integrator);
    const exported = await exportArchive(archive);
    return { view: describe(archive, filename, exportHash), notice: 'Exact accepted archive captured for simulation.',
      snapshot: { bytes: exported.bytes, provenance: bound.provenance, inputHash: bound.inputHash } };
  }
  if (action.type === 'export') {
    const exported = await exportArchive(archive);
    const view = describe(archive, filename, exported.identity.archiveHash);
    exportHash = exported.identity.archiveHash;
    return { view, bytes: exported.bytes, notice: 'Download prepared locally. Check your browser downloads; this is not cloud or durable save confirmation.' };
  }
  let candidate = archive, notice = 'No change; accepted document retained.';
  if (action.type === 'rename') {
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
  const view = describe(candidate, filename, exportHash);
  archive = candidate;
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
