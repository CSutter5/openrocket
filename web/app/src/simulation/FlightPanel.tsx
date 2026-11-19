import { useEffect, useRef, useState } from 'react';
import { request } from '../bridge';
import type { DocumentView } from '../model';
import { displayLength, lengthLabel, type LengthUnit } from '../units';
import { FlightJob, type JobState } from './job';
import { settings, type Integrator, type SessionResult } from './provenance';

function Plot({ result, unit }: { result: SessionResult; unit: LengthUnit }) {
  const rows = result.flight.series;
  const time = Math.max(...rows.map(r => r[0]), 1), altitude = Math.max(...rows.map(r => r[1]), 1);
  const points = rows.map(r => `${55 + r[0] / time * 590},${215 - r[1] / altitude * 180}`).join(' ');
  return <svg viewBox="0 0 680 265" role="img" aria-label={`Altitude versus time, ${unit}, seconds`} className="flight-plot">
    <title>Altitude versus time · {unit} and seconds</title>
    <path d="M55 30V215H645" fill="none" stroke="currentColor"/>
    <polyline points={points} fill="none" stroke="#0072b2" strokeWidth="2"/>
    <text x="55" y="20">Altitude ({unit}) · peak {displayLength(altitude, unit).toFixed(2)}</text>
    <text x="50" y="235">0</text><text x="580" y="235">{time.toFixed(2)} s</text>
    <text x="300" y="257">Time (s)</text>
  </svg>;
}
export function FlightPanel({ document, busy, unit, selectConfiguration }: { document: DocumentView; busy: boolean; unit: LengthUnit; selectConfiguration: (id: string) => void }) {
  const [integrator, setIntegrator] = useState<Integrator>('RK6');
  const [state, setState] = useState<JobState>({ status: 'idle' });
  const job = useRef<FlightJob | null>(null);
  if (!job.current) job.current = new FlightJob(setState, () => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }));
  useEffect(() => () => job.current?.dispose(), []);
  const running = ['starting', 'running'].includes(state.status), support = document.flightSupport;
  const result = state.result;
  const current = result && result.provenance.archiveTreeHash === document.hash && result.provenance.identitySidecarHash === document.identitySidecarHash && result.provenance.integrator === integrator && result.provenance.configurationId === document.flightConfigurationId;
  async function run() {
    if (!support.supported) return;
    const controller = job.current!, token = controller.prepare();
    try {
      const reply = await request({ type: 'flightSnapshot', expectedHash: document.hash, configurationId: support.configurationId, integrator });
      controller.start(token, reply.snapshot!);
    } catch (error) { controller.fail(token, error instanceof Error ? error.message : String(error)); }
  }
  return <section className="flight-panel" aria-label="Local flight simulation">
    <h2>Local flight simulation</h2>
    <p>Session-only browser results. New flights are not written to .ork downloads or imported stored results.</p>
    {!!document.flightConfigurations.length && <>
      <label htmlFor="flight-configuration">Motor configuration</label>
      <select id="flight-configuration" value={document.flightConfigurationId ?? ''} disabled={busy} onChange={event => selectConfiguration(event.target.value)}>
        {document.flightConfigurations.map(c => <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' · archived default' : ''}</option>)}
      </select>
      <p>Selection applies to this session's runs. The archived default and stored results are preserved.</p>
    </>}
    {support.supported ? <>
      <p><strong>Supported flight configuration</strong>: selected configuration, one active stage · <code>{support.configurationId}</code></p>
      <p><strong>Motor</strong>: {support.motor}. One motor; ignition and ejection use the archived configuration.</p>
      <p><strong>Recovery</strong>: {support.recovery}.</p>
      {support.kind === 'imported' && <p>New session run with the bounded settings below. Saved desktop simulations and custom expression columns are preserved separately and are not evaluated or overwritten.</p>}
      {!!support.catalogReferences.length && <p>Motor data resolved by exact digest from the pinned public catalog. Older embedded curve bytes are preserved. Catalog references: {support.catalogReferences.join(', ')}.</p>}
    </> : <p className="error" data-testid="flight-unsupported">{support.reason}</p>}
    <label htmlFor="flight-stepper">Flight integrator</label>
    <select id="flight-stepper" value={integrator} onChange={event => setIntegrator(event.target.value as Integrator)}>
      <option>RK4</option><option>RK6</option>
    </select>
    <details><summary>Run settings · bounded and read-only</summary>
      <dl><dt>Random seed</dt><dd>{settings.seed} (deterministic)</dd>
        <dt>Requested time step / maximum duration</dt><dd>{settings.timeStep} s / {support.supported ? support.maxTime : settings.maxTime} s</dd>
        <dt>Launch rod</dt><dd>{lengthLabel(settings.rodLength, unit)} · vertical · direction 90°</dd>
        <dt>Launch site</dt><dd>{settings.latitude}°, {settings.longitude}°, elevation {lengthLabel(settings.elevation, unit)}</dd>
        <dt>Atmosphere / gravity / geodesy</dt><dd>Extended ISA / WGS / spherical</dd>
        <dt>Wind</dt><dd>Seeded pink noise, mean {displayLength(settings.wind, unit)} {unit}/s, deviation {displayLength(settings.windDeviation, unit)} {unit}/s</dd>
      </dl>
    </details>
    <div className="flight-actions">
      <button disabled={busy || !support.supported} onClick={run}>{running ? 'Restart flight' : 'Run flight'}</button>
      <button disabled={!running} onClick={() => job.current!.cancel()}>Cancel flight</button>
    </div>
    <p role="status" data-testid="flight-status">{state.status === 'starting' ? 'Starting · capturing and validating accepted archive…'
      : state.status === 'running' ? 'Running Java simulation in a separate worker…'
      : state.status === 'completed' ? 'Flight completed.' : state.status === 'cancelled' ? 'Flight cancelled. Simulation worker terminated.'
      : state.status === 'failed' ? `Flight failed: ${state.error}` : 'Ready. Open the flight-ready sample to try a supported flight.'}</p>
    {running && <p>Indeterminate progress. Editing, importing, selection and unit switching remain available. This job retains its captured input.</p>}
    {result && <div data-testid="flight-result">
      <h3>{current ? 'Current session result' : 'Stale session result · document or run settings changed'}</h3>
      <p>Configuration <code>{result.provenance.configurationId}</code> · computed with {result.provenance.integrator}, seed {result.provenance.seed}. {current ? 'Matches the accepted archive and selected settings.' : 'Rerun to use the current document and settings.'}</p>
      <dl><dt>Maximum altitude ({unit})</dt><dd data-testid="flight-altitude">{displayLength(result.flight.summary[0], unit).toFixed(4)}</dd>
        <dt>Maximum speed ({unit}/s)</dt><dd>{displayLength(result.flight.summary[1], unit).toFixed(4)}</dd>
        <dt>Apogee time (s)</dt><dd>{result.flight.summary[2].toFixed(4)}</dd>
        <dt>Flight duration (s)</dt><dd>{result.flight.summary[3].toFixed(4)}</dd>
      </dl>
      <Plot result={result} unit={unit}/>
      <details><summary>Events · {result.flight.events.length}</summary><ol>{result.flight.events.map(([name, time], i) => <li key={i}>{name} · {time.toFixed(6)} s</li>)}</ol></details>
      <details><summary>Warnings · {result.flight.warningCount}</summary>{result.flight.warnings.length ? <ul>{result.flight.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : <p>No warnings reported.</p>}</details>
      <details><summary>Result provenance · exact input and engine</summary><dl>
        <dt>Input SHA-256</dt><dd data-testid="flight-input-hash">{result.inputHash}</dd>
        <dt>Archive SHA-256</dt><dd>{result.provenance.archiveTreeHash}</dd>
        <dt>Engine SHA-256</dt><dd>{result.provenance.engineHash}</dd>
        <dt>Motor data SHA-256</dt><dd>{result.provenance.motorCatalogHash}</dd>
        <dt>Output SHA-256</dt><dd>{result.outputHash}</dd>
      </dl></details>
    </div>}
  </section>;
}
