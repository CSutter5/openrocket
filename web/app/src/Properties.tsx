import React, { useState } from 'react';
import { LIMITS } from '@openrocket/ork-format';
import type { Action, ComponentView } from './model';
import { TubeProperties } from './TubeProperties';
import { Schematic } from './Schematic';
import { displayLength, lengthInput, lengthLabel, type LengthUnit } from './units';
import { useLengthInput } from './useLengthInput';

export function Properties({ component, editable, busy, edit, unit }: {
  component: ComponentView; editable: boolean; busy: boolean; edit: (action: Action) => void; unit: LengthUnit;
}) {
  const [name, setName] = useState(component.name ?? '');
  const radius = useLengthInput(component.tube?.state.radius ?? NaN, unit);
  const [numberError, setNumberError] = useState(false);
  const tube = component.tube;
  return <>
    <h2>{component.name || '(unnamed)'}</h2>
    <p className="component-kind">{component.type} · {editable ? 'Supported properties' : 'Read-only archive'}</p>
    <div className="property-fields"><form onSubmit={event => { event.preventDefault(); edit({ type: 'rename', id: component.id!, expected: component.name!, value: name }); }}>
      <label>Component name<input value={name} maxLength={LIMITS.name} disabled={busy || !editable} onChange={e => setName(e.target.value)}/></label>
      <button disabled={busy || !editable}>Apply name</button>
    </form>
    <form noValidate onSubmit={event => {
      event.preventDefault();
      const value = radius.metres;
      if (!Number.isFinite(value) || value <= 0 || value > 1) { setNumberError(true); return; }
      setNumberError(false); edit({ type: 'radius', id: component.id!, expected: tube!.state.radius, value });
    }}>
      <label>BodyTube outer radius ({unit})<input value={radius.text} type="text" inputMode="decimal" aria-describedby="radius-help" aria-invalid={!!numberError} disabled={busy || !tube || !editable} onChange={e => radius.change(e.target.value)}/></label>
      <button disabled={busy || !tube || !editable}>Apply radius</button>
      <p id="radius-help" className="muted">{tube ? `Greater than 0, up to ${lengthInput(1, unit)} ${unit}. Changing radius may clamp the wall, clear a preset and mark stored flights outdated.` : `Read-only: ${component.radiusReason}`}</p>
      {numberError && <p role="alert" className="error">Enter a finite outer radius greater than 0 and at most {lengthInput(1, unit)} {unit}. Accepted document retained.</p>}
    </form>
    {tube && <TubeProperties unit={unit} component={component} editable={editable} busy={busy} edit={edit}/>}
    </div>{tube && <section aria-label="Component measurements"><h3>Component measurements</h3>
      <p className="muted">Per component; excludes mass/CG overrides and motors. These are not whole-rocket values.</p>
      <dl><dt>Outer radius ({unit})</dt><dd data-testid="radius">{displayLength(tube.state.radius, unit)}</dd>
        <dt>Wall thickness ({unit})</dt><dd data-testid="thickness">{displayLength(tube.state.thickness, unit)}</dd>
        <dt>Intrinsic mass (kg)</dt><dd data-testid="mass">{tube.state.mass}</dd>
        <dt>Local CG ({unit})</dt><dd data-testid="cg">{displayLength(tube.state.cg, unit)}</dd>
        <dt>Length ({unit})</dt><dd data-testid="length">{displayLength(tube.input.length, unit)}</dd><dt>Density (kg/m³)</dt><dd data-testid="density">{tube.input.density}</dd>
        <dt>Preset attached</dt><dd>{tube.state.preset ? 'Yes' : 'No'}</dd>
      </dl>
      {'ring' in tube.state && <p>Automatic ring: outer radius {lengthLabel(tube.state.ring.outerRadius, unit)}; inner radius {lengthLabel(tube.state.ring.innerRadius, unit)}; intrinsic mass {tube.state.ring.mass} kg; local CG {lengthLabel(tube.state.ring.cg, unit)}.</p>}
    </section>}
    <details className="preview"><summary>Selected tube measurements and local schematic</summary><Schematic unit={unit} component={component}/></details>
    <details><summary>Imported properties · other values are read-only</summary>
      <p className="muted">Raw archive values are shown as stored, without inferred units or whole-rocket validation. Unsupported properties are preserved.</p>
      <dl>{component.properties.map((p, i) => <React.Fragment key={i}><dt>{p.name}</dt><dd>{p.value}</dd></React.Fragment>)}</dl>
    </details>
  </>;
}
