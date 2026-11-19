import { importArchive, sha256 } from '@openrocket/ork-format';
import { simulateArchive } from '../../../engine-adapter/build/generated/teavm/js/openrocket-g1-engine.js';
import { bindFlight, type FlightSnapshot, type SessionResult } from './provenance';
self.onmessage = async ({ data }: MessageEvent<FlightSnapshot & { jobId: number }>) => {
  const { jobId } = data;
  try {
    const archive = await importArchive(data.bytes, data.identity);
    const bound = await bindFlight(archive, data.provenance.integrator);
    if (bound.inputHash !== data.inputHash) throw new Error('Simulation snapshot/provenance mismatch');
    // The synchronous Java call cannot provide a truthful fractional progress value.
    self.postMessage({ jobId, inputHash: bound.inputHash, type: 'running' });
    const raw = simulateArchive(bound.model, data.provenance.integrator === 'RK6');
    const flight = JSON.parse(raw);
    const result: SessionResult = { schema: 1, source: 'browser-client', status: 'completed', flight,
      provenance: bound.provenance, inputHash: bound.inputHash, outputHash: await sha256(new TextEncoder().encode(raw)) };
    self.postMessage({ jobId, inputHash: bound.inputHash, type: 'completed', result });
  } catch (error) {
    self.postMessage({ jobId, inputHash: data.inputHash, type: 'failed', error: error instanceof Error ? error.message : String(error) });
  }
};
