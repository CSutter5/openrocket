import { simulationInputHash, DESKTOP_REVISION, type SimulationInput } from '@openrocket/contracts';
import { sha256, type ExpandedArchive } from '@openrocket/ork-format';
import manifest from '../../../engine-adapter/build/manifest.json';
import { flightInput } from './input';
export type Integrator = 'RK4' | 'RK6';
export const settings = Object.freeze({ seed: 42, timeStep: 0.05, maxTime: 120, rodLength: 1, rodAngle: 0, rodDirection: Math.PI / 2,
  latitude: 28.61, longitude: -80.60, elevation: 0, atmosphere: 'ISA', gravity: 'WGS', geodesy: 'SPHERICAL', wind: 1, windDeviation: 0.1 });
export async function bindFlight(archive: ExpandedArchive, integrator: Integrator, configurationId?: string) {
  if (!['RK4', 'RK6'].includes(integrator)) throw new Error('Unsupported integrator');
  const projection = await flightInput(archive, configurationId);
  const hash = (value: unknown) => sha256(new TextEncoder().encode(JSON.stringify(value)));
  const provenance: SimulationInput = { schema: 1, desktopRevision: DESKTOP_REVISION,
    engineHash: manifest.hashes['build/generated/teavm/js/openrocket-g1-engine.js'].sha256,
    motorCatalogHash: projection.motorHash, materialCatalogHash: projection.materialsHash,
    archiveTreeHash: archive.identity.archiveHash, identitySidecarHash: await hash(archive.identity),
    simulationId: projection.kind === 'sample' ? 'local-flight-profile-v1' : 'local-imported-flight-v1', configurationId: projection.configurationId,
    optionsHash: await hash({ ...settings, maxTime: projection.maxTime, integrator, modelHash: await sha256(new TextEncoder().encode(projection.model)) }), extensionSetHash: await hash([]), seed: settings.seed, integrator };
  return { model: projection.model, provenance, inputHash: await simulationInputHash(provenance) };
}
export interface FlightResult {
  rk6: boolean; mass: number; cg: number; cp: number; motorImpulse: number; motorThrustSamples: number[];
  summary: [number, number, number, number]; events: [string, number][]; series: [number, number, number, number][];
  warningCount: number; warnings: string[]; inputs: unknown;
}
export interface FlightSnapshot { bytes: Uint8Array; identity: import('@openrocket/contracts').IdentitySidecar; provenance: SimulationInput; inputHash: string }
export interface SessionResult { flight: FlightResult; provenance: SimulationInput; inputHash: string; outputHash: string; source: 'browser-client'; status: 'completed'; schema: 1 }
