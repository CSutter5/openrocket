import { useState } from 'react';
import type { Action, DocumentView } from './model';
import type { StageSettings } from './staging';
import { fieldRule } from './components';
import { ignitionEvents } from './motor-mount';
import { EditorUnits, QuantityInput } from './QuantityInput';
export function StagingEditor({ document, busy, edit, close }: { document: DocumentView; busy: boolean; edit: (action: Action) => Promise<boolean>; close: () => void }) {
  const [id, setId] = useState(document.stages[0]?.id);
  const [units, setUnits] = useState<Record<string, string>>({});
  const stage = document.stages.find(s => s.id === id);
  return <EditorUnits.Provider value={{ length: 'm', units, choose: (key, unit) => setUnits(current => ({ ...current, [key]: unit })) }}>
    <p>Settings apply to the selected flight configuration. Stage 0 is the uppermost stage.</p>
    <label className="native-choice">Stage<select aria-label="Stage" disabled={busy} value={id} onChange={event => setId(event.target.value)}>{document.stages.map(s => <option key={s.id} value={s.id}>{s.number} · {s.name}</option>)}</select></label>
    {stage && <StageDraft key={`${document.hash}:${id}`} stage={stage} busy={busy} save={settings => edit({ type: 'staging', expectedHash: document.hash, configurationId: document.flightConfigurationId!, settings })} close={close}/>}
  </EditorUnits.Provider>;
}
function StageDraft({ stage, busy, save, close }: { stage: StageSettings; busy: boolean; save: (settings: StageSettings) => Promise<boolean>; close: () => void }) {
  const [draft, setDraft] = useState(stage), [error, setError] = useState('');
  const separation = draft.separation, rule = fieldRule('stage', 'separationevent');
  const quantity = (label: string, value: string, dimension: 'time' | 'length', change: (value: string) => void) => <label className="native-row">{label}<QuantityInput label={label} value={value} change={change} dimension={dimension} unitKey={`staging-${label}`} disabled={busy} numeric/></label>;
  return <form className="staging-editor" onSubmit={async event => { event.preventDefault();if (await save(draft)) close();else setError('Stage settings could not be saved. Review the values and try again.'); }}>
    <label className="native-check"><input type="checkbox" checked={draft.active} disabled={busy} onChange={event => setDraft({ ...draft, active: event.target.checked })}/>Stage active</label>
    {stage.number > 0 && <fieldset className="native-group" disabled={busy}><legend>Stage separation</legend>
      <label className="native-choice">Separates at<select aria-label="Separates at" value={separation.event} onChange={event => setDraft({ ...draft, separation: { ...separation, event: event.target.value } })}>{rule?.values?.map(value => <option key={value} value={value}>{rule.labels?.[value] ?? value}</option>)}</select></label>
      {quantity('Separation delay', separation.delay, 'time', delay => setDraft({ ...draft, separation: { ...separation, delay } }))}
      {['altitudeascending', 'altitudedescending'].includes(separation.event) && quantity('Separation altitude', separation.altitude, 'length', altitude => setDraft({ ...draft, separation: { ...separation, altitude } }))}
    </fieldset>}
    {draft.motors.map((motor, index) => <fieldset className="native-group" key={motor.id} disabled={busy}><legend>Motor ignition · {motor.name}</legend>
      <label className="native-choice">Ignition at<select aria-label={`Ignition at ${motor.name}`} value={motor.event} onChange={event => setDraft({ ...draft, motors: draft.motors.map((m, i) => i === index ? { ...m, event: event.target.value } : m) })}>{Object.entries(ignitionEvents).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {quantity(`Ignition delay ${motor.name}`, motor.delay, 'time', delay => setDraft({ ...draft, motors: draft.motors.map((m, i) => i === index ? { ...m, delay } : m) }))}
    </fieldset>)}
    {!draft.motors.length && <p>No motor mounts in this stage. Enable a body or inner tube’s Motor tab, then assign a motor with Select motor.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="window-footer"><button type="button" disabled={busy} onClick={close}>Cancel</button><button disabled={busy}>OK</button></div>
  </form>;
}
