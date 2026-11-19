import type { FlightSnapshot, SessionResult } from './provenance';
export interface JobState { status: 'idle' | 'starting' | 'running' | 'completed' | 'cancelled' | 'failed'; error?: string; result?: SessionResult }
interface FlightWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(data: unknown): void;
  terminate(): void;
}
export class FlightJob {
  private generation = 0;
  private worker?: FlightWorker;
  state: JobState = { status: 'idle' };
  private changed: (state: JobState) => void;
  private createWorker: () => FlightWorker;
  constructor(changed: (state: JobState) => void, createWorker: () => FlightWorker) { this.changed = changed; this.createWorker = createWorker; }
  private publish(state: JobState) { this.state = state; this.changed(state); }
  // Reserve before snapshot acquisition as that asynchronous request can be cancelled too.
  prepare() {
    this.worker?.terminate(); this.worker = undefined;
    const token = ++this.generation;
    this.publish({ status: 'starting', result: this.state.result });
    return token;
  }
  start(token: number, snapshot: FlightSnapshot) {
    if (token !== this.generation || this.state.status !== 'starting') return;
    try {
      const worker = this.createWorker(); this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || this.generation !== token || data.jobId !== token || data.inputHash !== snapshot.inputHash) return;
        if (data.type === 'running') this.publish({ ...this.state, status: 'running' });
        else if (data.type === 'completed') {
          if (data.result?.inputHash !== snapshot.inputHash || JSON.stringify(data.result?.provenance) !== JSON.stringify(snapshot.provenance)) { this.fail(token, 'Result provenance mismatch'); return; }
          worker.terminate(); this.worker = undefined;
          this.publish({ status: 'completed', result: data.result });
        } else if (data.type === 'failed') this.fail(token, data.error);
      };
      worker.onerror = event => { event.preventDefault(); this.fail(token, 'Simulation worker failed. You can run again.'); };
      worker.postMessage({ ...snapshot, jobId: token });
    } catch (error) { this.fail(token, String(error)); }
  }
  fail(token: number, error: string) {
    if (token !== this.generation || !['starting', 'running'].includes(this.state.status)) return;
    this.worker?.terminate(); this.worker = undefined;
    this.publish({ status: 'failed', error, result: this.state.result });
  }
  cancel() {
    ++this.generation; this.worker?.terminate(); this.worker = undefined;
    this.publish({ status: 'cancelled', result: this.state.result });
  }
  dispose() { ++this.generation; this.worker?.terminate(); this.worker = undefined; }
}
