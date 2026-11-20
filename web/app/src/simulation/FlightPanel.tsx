import { useEffect, useRef, useState } from 'react';
import { request } from '../bridge';
import type { DocumentView } from '../model';
import { displayLength, lengthLabel, type LengthUnit } from '../units';
import { FlightJob, type JobState } from './job';
import { settings, type Integrator, type SessionResult } from './provenance';
import { FlightPlot } from './FlightPlot';

export function FlightPanel({ document, busy, unit, selectConfiguration }: { document: DocumentView; busy: boolean; unit: LengthUnit; selectConfiguration: (id: string) => void }) {
  const [integrator, setIntegrator] = useState<Integrator>('RK6');
  const [state, setState] = useState<JobState>({ status: 'idle' });
  const [selected, setSelected] = useState('session');
  const [results, setResults] = useState<Record<string, SessionResult>>({});
  const [graph, setGraph] = useState<string>();
  const active = useRef('session');
  const identities = document.simulations.map(s => s.id).join(',');
  useEffect(() => { setSelected('session'); setGraph(undefined); }, [identities]);
  const job = useRef<FlightJob | null>(null);
  if (!job.current) job.current = new FlightJob(next => {
    setState(next);
    if (next.status === 'completed' && next.result) setResults(previous => ({ ...previous, [active.current]: next.result! }));
  }, () => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }));
  useEffect(() => () => job.current?.dispose(), []);
  const saved = document.simulations.find(s => s.id === selected);
  const running = ['starting', 'running'].includes(state.status), support = saved?.support ?? document.flightSupport;
  const result = results[selected];
  const configurationId = saved ? saved.configurationId : document.flightConfigurationId;
  const stepper = saved?.integrator ?? integrator;
  const freshness = (r: SessionResult) => r.provenance.archiveTreeHash === document.hash && r.provenance.identitySidecarHash === document.identitySidecarHash;
  const graphSaved = document.simulations.find(s => s.id === graph), graphResult = graph ? results[graph] : undefined;
  const graphPlots = graphResult ? [{ name: 'Browser flight', points: graphResult.flight.series.map(row => [row[0], row[1]] as [number, number]) }] : graphSaved?.plots ?? [];
  const current = result && freshness(result) && result.provenance.integrator === stepper && result.provenance.configurationId === configurationId;
  async function run() {
    if (!support.supported || saved?.reason) return;
    active.current = selected;
    const controller = job.current!, token = controller.prepare();
    try {
      const reply = await request({ type: 'flightSnapshot', expectedHash: document.hash, configurationId: support.configurationId, integrator: stepper, simulationId: saved?.id });
      controller.start(token, reply.snapshot!);
    } catch (error) { controller.fail(token, error instanceof Error ? error.message : String(error)); }
  }
  return <section className="flight-panel" aria-label="Local flight simulation">
    <div className="panel-toolbar flight-toolbar">
      <label htmlFor="flight-stepper">Flight integrator</label>
      <select id="flight-stepper" value={stepper} disabled={!!saved} onChange={event => setIntegrator(event.target.value as Integrator)}><option>RK4</option><option>RK6</option></select>
      <button className="primary" disabled={busy || !support.supported || !!saved?.reason} onClick={run}>{running ? 'Restart flight' : 'Run flight'}</button>
      <button onClick={() => setGraph(selected)}>Plot</button>
      <button disabled={!running} onClick={() => job.current!.cancel()}>Cancel flight</button>
    </div>
    <div className="simulation-table table-scroll"><table><thead><tr><th>Name</th><th>Configuration</th><th>Status</th><th>Apogee ({unit})</th><th>Max. velocity ({unit}/s)</th><th>Time to apogee (s)</th></tr></thead><tbody>
      {['session', ...document.simulations.map(s => s.id)].map(id => {
        const row = document.simulations.find(s => s.id === id), completed = results[id], summary = completed?.flight.summary ?? row?.summary;
        const config = row ? row.configurationId : completed?.provenance.configurationId || document.flightConfigurationId;
        const label = document.flightConfigurations.find(c => c.id === config)?.label ?? config ?? (row ? 'Missing configuration' : 'No configuration');
        const currentRow = completed && freshness(completed) && (row ? completed.provenance.configurationId === row.configurationId : completed.provenance.configurationId === document.flightConfigurationId && completed.provenance.integrator === integrator);
        return <tr key={id} aria-selected={selected === id} className={selected === id ? 'selected-row' : ''} onClick={() => setSelected(id)} onDoubleClick={() => { setSelected(id); setGraph(id); }}>
          <td><button aria-pressed={selected === id} onClick={() => setSelected(id)}>{row?.name ?? 'Session flight'}</button></td><td>{label}</td>
          <td>{completed ? currentRow ? 'Completed · current' : 'Completed · stale' : row ? `${row.status} · unverified` : 'Not run'}</td>
          <td>{summary?.[0] != null ? displayLength(summary[0], unit).toFixed(2) : '—'}</td><td>{summary?.[1] != null ? displayLength(summary[1], unit).toFixed(2) : '—'}</td><td>{summary?.[2] != null ? summary[2].toFixed(2) : '—'}</td>
        </tr>;
      })}
    </tbody></table></div>
    <p className="muted">Select a simulation to run it. Double-click a row to open its graph.</p>
    {saved && <><p><strong>Selected simulation: {saved.name}</strong> · uses the configuration and supported launch/weather settings saved in the .ork file. {saved.options && !saved.reason && 'Runs use seed ' + saved.options.randomseed + ' (42 when no seed was saved).'}</p>{saved.reason && <p role="alert" className="error">Cannot run this saved simulation: {saved.reason}.</p>}</>}
    <h2>Local flight simulation</h2>
    <p>Session-only browser results. New flights are not written to .ork downloads or imported stored results.</p>
    {!!document.flightConfigurations.length && <>
      <label htmlFor="flight-configuration">Motor configuration</label>
      <select id="flight-configuration" value={configurationId ?? ''} disabled={busy || !!saved} onChange={event => selectConfiguration(event.target.value)}>
        {saved && !document.flightConfigurations.some(c => c.id === configurationId) && <option value={configurationId ?? ''}>Unresolved saved configuration</option>}
        {document.flightConfigurations.map(c => <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' · archived default' : ''}</option>)}
      </select>
      <p>{saved ? 'This configuration is read from the selected simulation in the .ork file.' : 'Selection applies to this session’s runs. The archived default and stored results are preserved.'}</p>
    </>}
    {support.supported ? <>
      <p><strong>Supported flight configuration</strong>: selected configuration, one active stage · <code>{support.configurationId}</code></p>
      <p><strong>Motor</strong>: {support.motor}. One motor; ignition and ejection use the archived configuration.</p>
      <p><strong>Recovery</strong>: {support.recovery}.</p>
      {!saved && support.kind === 'imported' && <p>New session run with the bounded settings below. Saved desktop simulations and custom expression columns are preserved separately and are not evaluated or overwritten.</p>}
      {!!support.catalogReferences.length && <p>Motor data resolved by exact digest from the pinned public catalog. Older embedded curve bytes are preserved. Catalog references: {support.catalogReferences.join(', ')}.</p>}
    </> : <p className="error" data-testid="flight-unsupported">{support.reason}</p>}
    <details><summary>Run settings · bounded and read-only</summary>
      {saved?.options ? <dl>
        <dt>Random seed</dt><dd>{saved.options.randomseed}</dd><dt>Time step / maximum duration</dt><dd>{saved.options.timestep} s / {saved.options.maxtime} s</dd>
        <dt>Launch rod</dt><dd>{lengthLabel(Number(saved.options.launchrodlength), unit)} · {saved.options.launchrodangle}° · {saved.options.launchintowind === 'true' ? 'into wind' : `direction ${saved.options.launchroddirection}°`}</dd>
        <dt>Launch site</dt><dd>{saved.options.launchlatitude}°, {saved.options.launchlongitude}° · elevation {lengthLabel(Number(saved.options.launchaltitude), unit)}</dd>
        <dt>Wind</dt><dd>Mean {displayLength(Number(saved.options['wind/speed']), unit).toFixed(3)} {unit}/s · deviation {displayLength(Number(saved.options['wind/standarddeviation']), unit).toFixed(3)} {unit}/s</dd>
        <dt>Atmosphere / gravity / geodesy</dt><dd>{saved.options.atmosphere} / {saved.options.gravity} / {saved.options.geodeticmethod}</dd>
      </dl> : <dl><dt>Random seed</dt><dd>{settings.seed} (deterministic)</dd>
        <dt>Requested time step / maximum duration</dt><dd>{settings.timeStep} s / {support.supported ? support.maxTime : settings.maxTime} s</dd>
        <dt>Launch rod</dt><dd>{lengthLabel(settings.rodLength, unit)} · vertical · direction 90°</dd>
        <dt>Launch site</dt><dd>{settings.latitude}°, {settings.longitude}°, elevation {lengthLabel(settings.elevation, unit)}</dd>
        <dt>Atmosphere / gravity / geodesy</dt><dd>Extended ISA / WGS / spherical</dd>
        <dt>Wind</dt><dd>Seeded pink noise, mean {displayLength(settings.wind, unit)} {unit}/s, deviation {displayLength(settings.windDeviation, unit)} {unit}/s</dd>
      </dl>}
    </details>
    <p role="status" data-testid="flight-status">{state.status === 'starting' ? 'Starting · capturing and validating accepted archive…'
      : state.status === 'running' ? 'Running Java simulation in a separate worker…'
      : state.status === 'completed' ? 'Flight completed.' : state.status === 'cancelled' ? 'Flight cancelled. Simulation worker terminated.'
      : state.status === 'failed' ? `Flight failed: ${state.error}` : saved ? `Ready to run ${saved.name} with its saved settings.` : 'Ready. Open the flight-ready sample to try a supported flight.'}</p>
    {running && <p>Indeterminate progress. Editing, importing, selection and unit switching remain available. This job retains its captured input.</p>}
    {result && <div data-testid="flight-result">
      <h3>{current ? 'Current session result' : 'Stale session result · document or run settings changed'}</h3>
      <p>Configuration <code>{result.provenance.configurationId}</code> · computed with {result.provenance.integrator}, seed {result.provenance.seed}. {current ? 'Matches the accepted archive and selected settings.' : 'Rerun to use the current document and settings.'}</p>
      <dl><dt>Maximum altitude ({unit})</dt><dd data-testid="flight-altitude">{displayLength(result.flight.summary[0], unit).toFixed(4)}</dd>
        <dt>Maximum speed ({unit}/s)</dt><dd>{displayLength(result.flight.summary[1], unit).toFixed(4)}</dd>
        <dt>Apogee time (s)</dt><dd>{result.flight.summary[2].toFixed(4)}</dd>
        <dt>Flight duration (s)</dt><dd>{result.flight.summary[3].toFixed(4)}</dd>
      </dl>
      <button onClick={() => setGraph(selected)}>Open flight graph</button>
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
    {graph && <FlightPlot plots={graphPlots} unit={unit} name={graphSaved?.name ?? 'Session flight'} source={graphResult ? freshness(graphResult) ? 'Browser result for this archive' : 'Stale browser result · the document changed' : `Stored archive data · ${graphSaved?.status ?? 'unavailable'} · unverified`} close={() => setGraph(undefined)}/>}
  </section>;
}
