import { useEffect, useRef, useState } from 'react';
import { request } from '../bridge';
import type { DocumentView } from '../model';
import { displayLength, lengthUnits, type LengthUnit } from '../units';
import { FlightJob, type JobState } from './job';
import type { SessionResult } from './provenance';
import { FlightPlot } from './FlightPlot';

export function FlightPanel({ document, busy, unit, setUnit }: { document: DocumentView; busy: boolean; unit: LengthUnit; setUnit: (unit: LengthUnit) => void }) {
  const [state, setState] = useState<JobState>({ status: 'idle' });
  const [selected, setSelected] = useState('');
  const [results, setResults] = useState<Record<string, SessionResult>>({});
  const [graph, setGraph] = useState<string>();
  const active = useRef('');
  const identities = document.simulations.map(s => s.id).join(',');
  useEffect(() => {
    setSelected(document.simulations.find(s => s.configurationId === document.flightConfigurationId)?.id ?? document.simulations[0]?.id ?? '');
    setGraph(undefined);
  }, [identities]);
  const job = useRef<FlightJob | null>(null);
  if (!job.current) job.current = new FlightJob(next => {
    setState(next);
    if (next.status === 'completed' && next.result) setResults(previous => ({ ...previous, [active.current]: next.result! }));
  }, () => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }));
  useEffect(() => () => job.current?.dispose(), []);
  const saved = document.simulations.find(s => s.id === selected);
  const running = ['starting', 'running'].includes(state.status);
  const freshness = (r: SessionResult) => r.provenance.archiveTreeHash === document.hash && r.provenance.identitySidecarHash === document.identitySidecarHash;
  const graphSaved = document.simulations.find(s => s.id === graph), graphResult = graph ? results[graph] : undefined;
  const graphPlots = graphResult ? [{ name: 'Flight', points: graphResult.flight.series.map(row => [row[0], row[1]] as [number, number]) }] : graphSaved?.plots ?? [];
  const reason = saved?.reason ?? (saved?.support && !saved.support.supported ? saved.support.reason : undefined);
  async function run() {
    if (!saved?.support?.supported || saved.reason || !saved.integrator) return;
    active.current = saved.id;
    const controller = job.current!, token = controller.prepare();
    try {
      const reply = await request({ type: 'flightSnapshot', expectedHash: document.hash, configurationId: saved.support.configurationId, integrator: saved.integrator, simulationId: saved.id });
      controller.start(token, reply.snapshot!);
    } catch (error) { controller.fail(token, error instanceof Error ? error.message : String(error)); }
  }
  return <section className="flight-panel" aria-label="Flight simulations">
    <div className="panel-toolbar flight-toolbar">
      <button className="primary" disabled={busy || !saved || !!reason} onClick={run}>{running ? 'Restart flight' : 'Run flight'}</button>
      <button disabled={!saved} onClick={() => setGraph(selected)}>Plot</button>
      <button disabled={!running} onClick={() => job.current!.cancel()}>Cancel flight</button>
      <label>Simulation units<select aria-label="Simulation units" value={unit} onChange={event => setUnit(event.target.value as LengthUnit)}>{lengthUnits.map(u => <option key={u.id} value={u.id}>{u.label} ({u.id})</option>)}</select></label>
    </div>
    <div className="simulation-table table-scroll"><table><thead><tr><th>Name</th><th>Configuration</th><th>Status</th><th>Apogee ({unit})</th><th>Max. velocity ({unit}/s)</th><th>Time to apogee (s)</th></tr></thead><tbody>
      {document.simulations.map(row => {
        const completed = results[row.id], summary = completed?.flight.summary ?? row.summary;
        const label = document.flightConfigurations.find(c => c.id === row.configurationId)?.label ?? row.configurationId ?? 'Missing configuration';
        const current = completed && freshness(completed) && completed.provenance.configurationId === row.configurationId;
        const status = running && active.current === row.id ? 'Running…' : completed ? current ? 'Completed' : 'Outdated' : row.status === 'not_simulated' ? 'Not run' : row.status === 'outdated' ? 'Outdated' : 'Stored result';
        return <tr key={row.id} aria-selected={selected === row.id} className={selected === row.id ? 'selected-row' : ''} onClick={() => setSelected(row.id)} onDoubleClick={() => { setSelected(row.id); setGraph(row.id); }}>
          <td><button aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}>{row.name}</button></td><td>{label}</td><td>{status}</td>
          <td>{summary?.[0] != null ? displayLength(summary[0], unit).toFixed(unit === 'km' || unit === 'mi' ? 6 : 2) : '—'}</td><td>{summary?.[1] != null ? displayLength(summary[1], unit).toFixed(unit === 'km' || unit === 'mi' ? 6 : 2) : '—'}</td><td>{summary?.[2] != null ? summary[2].toFixed(2) : '—'}</td>
        </tr>;
      })}
    </tbody></table>{!document.simulations.length && <p className="empty-state">No simulations. Create a configuration in Motors &amp; Configuration to add one.</p>}</div>
    {reason && <p role="alert" className="error">{reason}</p>}
    {state.status !== 'idle' && <p role="status" data-testid="flight-status">{state.status === 'starting' ? 'Starting flight…' : state.status === 'running' ? 'Running flight…' : state.status === 'completed' ? 'Flight completed.' : state.status === 'cancelled' ? 'Flight cancelled.' : `Flight failed: ${state.error}`}</p>}
    {graph && graphSaved && <FlightPlot plots={graphPlots} unit={unit} setUnit={setUnit} name={graphSaved.name} source={graphResult ? freshness(graphResult) ? 'Completed flight' : 'Outdated result' : 'Stored flight data'} close={() => setGraph(undefined)}/>}
  </section>;
}
