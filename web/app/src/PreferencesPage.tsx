import { useState, type CSSProperties } from 'react';
import { accountRequest } from './accounts';
import { fontWeights, preferenceUnits, unitPreset, type Preferences, type SavedPreferences, type UnitPreference } from './preferences';

const fields: [UnitPreference, string, boolean][] = [
  ['LENGTH', 'Rocket dimensions', true], ['MOTOR_DIMENSIONS', 'Motor dimensions', true], ['DISTANCE', 'Distance', true], ['VELOCITY', 'Velocity', true],
  ['ACCELERATION', 'Acceleration', false], ['MASS', 'Mass', true], ['FORCE', 'Force', false], ['IMPULSE', 'Total impulse', true], ['INERTIA', 'Moment of inertia', false],
  ['STABILITY', 'Stability', false], ['SECONDARY_STABILITY', 'Secondary stability', false],
  ['DENSITY_LINE', 'Line density', true], ['DENSITY_SURFACE', 'Surface density', true], ['DENSITY_BULK', 'Bulk density', true], ['ROUGHNESS', 'Surface roughness', false],
  ['AREA', 'Area', false], ['ANGLE', 'Angle', true], ['ROLL', 'Roll rate', false], ['TEMPERATURE', 'Temperature', false], ['PRESSURE', 'Pressure', false],
  ['WINDSPEED', 'Wind speed', false], ['LATITUDE', 'Latitude', false], ['LONGITUDE', 'Longitude', false],
];
export function PreferencesPage({ initial, saved, returnTo }: { initial: SavedPreferences; saved: (value: SavedPreferences) => void; returnTo: string }) {
  const [accepted, setAccepted] = useState(initial), [draft, setDraft] = useState(initial.preferences), [tab, setTab] = useState('UI');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const ui = draft.ui, changed = JSON.stringify(draft) !== JSON.stringify(accepted.preferences);
  function changeUI(change: Partial<Preferences['ui']>) { setDraft({ ...draft, ui: { ...ui, ...change } });setNotice(''); }
  async function save(close: boolean) {
    setBusy(true);setError('');setNotice('');
    try {
      const result = await accountRequest<SavedPreferences>('/api/account/preferences', { expectedVersion: accepted.version, preferences: draft });
      setAccepted(result);saved(result);setNotice('Preferences saved for your account.');
      if (close) location.assign(returnTo);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const previewStyle: CSSProperties = { fontSize: `${Math.max(8, ui.fontSize * ui.scale)}px`, fontWeight: fontWeights[ui.fontStyle], letterSpacing: `${ui.characterSpacing / 100}em` };
  return <section className="rocket-library preferences-page"><h1>Preferences</h1><p>These settings belong to your account and follow you between browsers. They apply to your view of every rocket.</p>
    <form onSubmit={event => { event.preventDefault();void save(true); }} onKeyDown={event => { if (event.key === 'Escape' && !busy) location.assign(returnTo); }}>
      <div className="workspace-tabs" role="tablist" aria-label="Preferences">{['UI', 'Units'].map(name => <button key={name} type="button" role="tab" id={`preferences-${name}`} aria-controls={`preferences-panel-${name}`} aria-selected={name === tab} tabIndex={name === tab ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault();const next = event.key === 'Home' ? 'UI' : event.key === 'End' ? 'Units' : tab === 'UI' ? 'Units' : 'UI';setTab(next);document.getElementById(`preferences-${next}`)?.focus(); }
      }}>{name}</button>)}</div>
      <fieldset disabled={busy} className="preferences-fields">
        <div role="tabpanel" id="preferences-panel-UI" aria-labelledby="preferences-UI" hidden={tab !== 'UI'}>
          <div className="preferences-ui-fields">
            <label htmlFor="preference-theme">UI theme</label><select id="preference-theme" value={ui.theme} onChange={event => changeUI({ theme: event.target.value as Preferences['ui']['theme'] })}><option value="dark">Dark</option><option value="contrast">Dark, high-contrast</option><option value="light">Light</option></select>
            <label htmlFor="preference-scale">UI scale</label><input id="preference-scale" type="number" min="0.5" max="2" step="0.05" required value={ui.scale} onChange={event => changeUI({ scale: Number(event.target.value) })}/>
            <label htmlFor="preference-font-size">Font size</label><input id="preference-font-size" type="number" min="5" max="25" step="1" required value={ui.fontSize} onChange={event => changeUI({ fontSize: Number(event.target.value) })}/>
            <label htmlFor="preference-font-style">Font style</label><select id="preference-font-style" value={ui.fontStyle} onChange={event => changeUI({ fontStyle: event.target.value as Preferences['ui']['fontStyle'] })}>{Object.keys(fontWeights).map(style => <option key={style}>{style}</option>)}</select>
            <label htmlFor="preference-spacing">Character spacing</label><input id="preference-spacing" type="number" min="-20" max="30" step="1" required value={ui.characterSpacing} onChange={event => changeUI({ characterSpacing: Number(event.target.value) })}/>
          </div>
          <fieldset className="ui-preview" data-theme={ui.theme} style={previewStyle}><legend>UI preview</legend><h2>Preview Heading</h2><p>This is how your text will look</p><div><button type="button">Sample Button</button><input aria-label="Sample text input" placeholder="Sample Text Input"/></div><div><select aria-label="Sample combo box"><option>Combo Box Item 1</option><option>Combo Box Item 2</option></select><input aria-label="Sample number input" type="number" defaultValue="42"/></div><label className="preferences-check"><input type="checkbox" defaultChecked/>Sample Checkbox</label></fieldset>
          <p className="muted">UI scale adjusts text and controls. Changes apply after Apply or OK; no restart is needed.</p>
        </div>
        <div role="tabpanel" id="preferences-panel-Units" aria-labelledby="preferences-Units" hidden={tab !== 'Units'}>
          <p>Select your preferred units:</p><div className="preferences-unit-columns">{[fields.slice(0, 11), fields.slice(11)].map((column, index) => <div key={index}>{column.map(([key, label, available]) => <div className="preferences-unit-row" key={key}>
            <label htmlFor={`preference-${key}`}>{label}{!available && <small>Not displayed in the web editor yet</small>}</label>
            <select id={`preference-${key}`} value={draft.units[key]} disabled={key === 'SECONDARY_STABILITY' && !draft.displaySecondaryStability} onChange={event => { setDraft({ ...draft, units: { ...draft.units, [key]: event.target.value } });setNotice(''); }}>{preferenceUnits[key].options.map(unit => <option key={unit.id} value={unit.id}>{unit.id}</option>)}</select>
          </div>)}{index === 0 && <label className="preferences-check"><input type="checkbox" checked={draft.displaySecondaryStability} onChange={event => setDraft({ ...draft, displaySecondaryStability: event.target.checked })}/>Display secondary stability unit</label>}</div>)}</div>
          <div className="preferences-presets"><button type="button" onClick={() => { setDraft({ ...draft, units: unitPreset('metric') });setNotice(''); }}>Default metric</button><button type="button" onClick={() => { setDraft({ ...draft, units: unitPreset('imperial') });setNotice(''); }}>Default imperial</button></div>
          <p className="muted">Defaults apply the next time you open a rocket or component window. Each field can still use its own unit. Unit changes affect display only; rocket files and simulation inputs stay in their original units.</p>
          <p className="muted">All desktop unit defaults are saved. Quantities marked above, including stability margins, will not appear until their corresponding web views are available.</p>
          <p className="muted">Fractional-inch defaults use decimal input in web fields.</p>
        </div>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="window-footer"><button type="button" disabled={busy || !changed} onClick={event => { if (event.currentTarget.form!.reportValidity()) void save(false); }}>Apply</button><button type="button" disabled={busy} onClick={() => location.assign(returnTo)}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'OK'}</button></div>
    </form>
  </section>;
}
