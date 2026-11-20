import { useState, type ReactNode } from 'react';
import { LIMITS } from '@openrocket/ork-format';
import type { Action, ComponentPropertyChange, ComponentView, DocumentView } from './model';
import { fieldRule, attributeChoices } from './components';
import { Properties } from './Properties';
import { QuantityInput, useEditorUnit } from './QuantityInput';
import { propertyDimension, quantityNumber, quantityUnits, type Dimension } from './quantities';
import type { LengthUnit } from './units';
import materials from '../build/components/materials.json';

const labels: Record<string, string> = {
  length: 'Length', thickness: 'Wall thickness', radius: 'Outer radius', outerradius: 'Outer radius', innerradius: 'Inner radius',
  packedlength: 'Packed length', packedradius: 'Packed radius', diameter: 'Diameter', height: 'Height',
  rootchord: 'Root chord', tipchord: 'Tip chord', sweeplength: 'Sweep length', cant: 'Fin cant', fincount: 'Number of fins',
  instancecount: 'Instance count', instanceseparation: 'Instance separation', angleoffset: 'Rotation', radialdirection: 'Radial direction',
  radialposition: 'Radial position', radiusoffset: 'Radial offset', outerdiameter: 'Outer diameter', innerdiameter: 'Inner diameter',
  baseheight: 'Base height', flangeheight: 'Flange height', screwheight: 'Screw height', mass: 'Mass',
  masscomponenttype: 'Component type', deployevent: 'Deploys at', deployaltitude: 'Deployment altitude', deploydelay: 'Deployment delay',
  cd: 'Drag coefficient', linecount: 'Number of lines', linelength: 'Line length', striplength: 'Strip length', stripwidth: 'Strip width',
  clusterconfiguration: 'Cluster configuration', clusterscale: 'Cluster scale', clusterrotation: 'Cluster rotation',
};
function title(name: string) { return labels[name] ?? name.replace(/^./, c => c.toUpperCase()); }
const numberToken = (text: string) => quantityNumber(text.replace(/^auto\s+/, ''));

function NumericRow({ label, value, change, dimension, unitKey, disabled, min = 0, max = 1, integer = false, slider = true, children }: {
  label: string; value: string; change: (value: string) => void; dimension?: Dimension; unitKey?: string; disabled?: boolean;
  min?: number; max?: number; integer?: boolean; slider?: boolean; children?: ReactNode;
}) {
  const number = quantityNumber(value), upper = Math.max(max, Number.isFinite(number) ? number : max);
  return <div className="native-field">
    <div className="native-row"><label>{label}:</label>
      {dimension ? <QuantityInput label={label} value={value} change={change} dimension={dimension} unitKey={unitKey ?? label} disabled={disabled} numeric/>
        : <input aria-label={label} type="number" step={integer ? 1 : 'any'} value={Number.isFinite(number) ? value : ''} disabled={disabled} onChange={event => change(event.target.value)}/>}
      {slider && <input className="native-slider" aria-label={`${label} slider`} type="range" min={min} max={upper} step={integer ? 1 : (upper - min) / 1000 || .001} value={Number.isFinite(number) ? Math.max(min, number) : min} disabled={disabled} onChange={event => change(event.target.value)}/>}
    </div>{children && <div className="native-row-option">{children}</div>}
  </div>;
}

type Props = { component: ComponentView; document: DocumentView; editable: boolean; busy: boolean; unit: LengthUnit;
  edit: (action: Action) => Promise<boolean>; close: () => void; motors: () => void; tab: string; setTab: (tab: string) => void };
export function ComponentEditor({ component, document, editable, busy, unit, edit, close, motors, tab, setTab }: Props) {
  const [name, setName] = useState(component.name ?? '');
  const [draft, setDraft] = useState<Record<string, ComponentPropertyChange>>({});
  const [error, setError] = useState('');
  const [previousWall, setPreviousWall] = useState('0.002');
  const disabled = busy || !editable;
  const fins = ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset'].includes(component.type), body = component.type === 'bodytube', nose = component.type === 'nosecone';
  const tabs = ['General', ...(body || component.type === 'innertube' ? ['Motor'] : []), ...(nose || component.type === 'transition' ? ['Shoulder'] : []), ...(fins ? ['Fin tabs'] : []), 'Override', 'Appearance', 'Comment', 'Advanced'];
  const active = tabs.includes(tab) ? tab : 'General';
  const original = (name: string) => component.properties.filter(p => p.name === name).at(-1);
  const defaultMaterial = materials.find(m => m.name === 'Cardboard' && m.type === 'bulk')!;
  function property(name: string, value = name === 'filletmaterial' ? defaultMaterial.name : '0', attributes: Record<string, string> = name === 'tabposition' ? { relativeto: 'middle' } : name === 'filletmaterial' ? Object.fromEntries(Object.entries(defaultMaterial).filter(([k]) => k !== 'name').map(([k, v]) => [k, String(v)])) : {}): ComponentPropertyChange {
    return draft[name] ?? original(name) ?? { name, value, attributes };
  }
  function set(name: string, value: string, attributes?: Record<string, string>) {
    const next = { ...property(name), value, remove: false, ...(attributes ? { attributes } : {}) };
    setDraft(current => ({ ...current, [name]: next }));
  }
  function remove(name: string) { setDraft(current => ({ ...current, [name]: { ...property(name), remove: true } })); }
  const number = (name: string, fallback = '0') => numberToken(property(name, fallback).value);
  const isAutomatic = (name: string) => property(name).value.startsWith('auto');
  const radiusName = body ? 'radius' : 'aftradius';
  const drawn = document.drawing.polygons.find(p => document.components[document.drawing.componentIndices[p.index]]?.id === component.id);
  const resolvedRadius = drawn ? Math.max(...drawn.points.map(p => Math.abs(p[1]))) : NaN;
  const radius = isAutomatic(radiusName) && !draft[radiusName] && Number.isFinite(resolvedRadius) ? resolvedRadius : number(radiusName);
  const filled = property('thickness').value === 'filled' || property('filled', 'false').value === 'true';
  const wall = filled ? radius : number('thickness');

  function checkbox(label: string, checked: boolean, change: (checked: boolean) => void, inactive = disabled) {
    return <label className="native-check"><input type="checkbox" checked={checked} disabled={inactive} onChange={event => change(event.target.checked)}/>{label}</label>;
  }
  function enumRow(name: string, label = title(name), fallback?: string) {
    const rule = fieldRule(component.type, name), value = property(name, fallback ?? rule?.values?.[0] ?? '').value;
    return <label className="native-choice" key={name}><span>{label}:</span><select aria-label={label} disabled={disabled} value={value} onChange={event => set(name, event.target.value)}>
      {!(rule?.values ?? []).includes(value) && <option value={value}>{value}</option>}
      {rule?.values?.map(v => <option key={v} value={v}>{rule.labels?.[v] ?? title(v)}</option>)}
    </select></label>;
  }
  function field(name: string, label = title(name), options: { multiplier?: number; max?: number; min?: number; fallback?: string; dimension?: Dimension; automatic?: boolean; slider?: boolean; disabled?: boolean } = {}) {
    const rule = fieldRule(component.type, name), multiplier = options.multiplier ?? 1;
    const automatic = options.automatic ?? (rule?.special === 'auto');
    const raw = property(name, options.fallback ?? '0').value;
    const n = name === radiusName && (body || nose) ? radius : numberToken(raw);
    const inactive = disabled || options.disabled || automatic && isAutomatic(name) || name === 'thickness' && filled;
    const value = Number.isFinite(n) ? String(n * multiplier) : '';
    return <NumericRow key={name} label={label} value={value} change={v => set(name, multiplier === 1 ? v : String(quantityNumber(v) / multiplier))}
      unitKey={name + (multiplier === 2 ? '-diameter' : '')} dimension={options.dimension ?? propertyDimension(name)} disabled={inactive}
      max={options.max ?? 1} min={options.min} integer={rule?.kind === 'IntSetter'} slider={options.slider ?? rule?.kind !== 'IntSetter'}>
      {automatic && checkbox('Automatic', isAutomatic(name), checked => set(name, checked ? rule?.separator ? `auto ${Number.isFinite(n) ? n : 0}` : 'auto' : String(Number.isFinite(n) ? n : 0)))}
      {name === 'thickness' && rule?.special === 'filled' && checkbox('Filled', filled, checked => {
        if (checked) { setPreviousWall(property(name).value);set(name, 'filled'); } else set(name, previousWall);
      })}
    </NumericRow>;
  }
  function material(name = 'material', legend = 'Material', nested = false) {
    const p = name === 'filletmaterial' ? property(name) : property(name, 'Custom', { type: 'bulk', density: '0' }), options = materials.filter(m => m.type === p.attributes.type);
    const index = options.findIndex(m => m.name === p.value && m.density === Number(p.attributes.density));
    return <fieldset className="native-group" key={name}>{!nested && <legend>{legend}</legend>}
      <label className="native-stacked">{name === 'filletmaterial' ? 'Fillet material:' : 'Component material:'}<select aria-label={name === 'filletmaterial' ? 'Fillet material' : 'Component material'} disabled={disabled} value={index < 0 ? 'custom' : index} onChange={event => {
        if (event.target.value === 'custom') return;
        const selected = options[Number(event.target.value)], attributes = { ...p.attributes };
        for (const key of Object.keys(attributes)) if (key in selected) attributes[key] = String(selected[key as keyof typeof selected]);
        set(name, selected.name, attributes);
      }}>{index < 0 && <option value="custom">{p.value}</option>}{options.map((m, i) => <option value={i} key={i}>{m.name}</option>)}</select></label>
      {name === 'material' && fieldRule(component.type, 'finish') && enumRow('finish', 'Component finish', 'normal')}
      <details className="material-properties"><summary>Material properties</summary>
        <label className="native-stacked">Material name<input aria-label={`${legend} name`} value={p.value} disabled={disabled} onChange={event => set(name, event.target.value)}/></label>
        {p.attributes.density !== undefined && <NumericRow label={`${legend} density`} value={p.attributes.density} dimension={propertyDimension(name, 'density', p.attributes)} unitKey={`${name}-density`} disabled={disabled} slider={false} change={value => set(name, p.value, { ...p.attributes, density: value })}/>}
        {p.attributes.shearModulus !== undefined && <NumericRow label={`${legend} shear modulus`} value={p.attributes.shearModulus} dimension="pressure" unitKey={`${name}-shear`} disabled={disabled} slider={false} change={value => set(name, p.value, { ...p.attributes, shearModulus: value })}/>}
      </details>
    </fieldset>;
  }
  function placement() {
    const p = property('axialoffset', '0', { method: 'bottom' }), method = p.attributes.method ?? 'bottom';
    return <fieldset className="native-group"><legend>Placement</legend>
      <label className="native-choice"><span>Position relative to:</span><select aria-label="Position relative to" disabled={disabled} value={method} onChange={event => set('axialoffset', p.value, { method: event.target.value })}>
        <option value="top">Top of the parent component</option><option value="middle">Middle of the parent component</option><option value="bottom">Bottom of the parent component</option><option value="after">After the previous component</option><option value="absolute">Tip of the rocket</option>
      </select></label>
      {field('axialoffset', 'Position offset', { min: -1, max: 1 })}
      {field('rotation', 'Fin rotation', { dimension: 'angle', min: -180, max: 180 })}
    </fieldset>;
  }
  const ignored = new Set(['preset', 'material', 'filletmaterial', 'linematerial', 'finish', 'color', 'linestyle', 'comment', 'position', 'rotation', 'overridecg', 'overridemass', 'overridecd', 'overridesubcomponents', 'overridesubcomponentsmass', 'overridesubcomponentscg', 'overridesubcomponentscd']);
  function generic() {
    return <div className="native-columns"><div>{component.properties.filter((p, i, all) => !ignored.has(p.name) && all.findIndex(n => n.name === p.name) === i).map(p => {
      const rule = fieldRule(component.type, p.name);
      if (rule?.values) return enumRow(p.name);
      if (rule?.kind === 'BooleanSetter') return <div key={p.key}>{checkbox(title(p.name), property(p.name).value === 'true', checked => set(p.name, String(checked)))}</div>;
      return <div key={p.key}>{propertyDimension(p.name) || ['IntSetter', 'DoubleSetter', 'OverrideSetter'].includes(rule?.kind ?? '') ? field(p.name) : <label className="native-stacked">{title(p.name)}<input aria-label={title(p.name)} disabled={disabled} value={property(p.name).value} onChange={event => set(p.name, event.target.value)}/></label>}
        {Object.entries(p.attributes).map(([key, value]) => attributeChoices(p.name, key) ? <label className="native-choice" key={key}>{title(key)}<select aria-label={`${title(p.name)} ${key}`} disabled={disabled} value={property(p.name).attributes[key] ?? value} onChange={event => set(p.name, property(p.name).value, { ...property(p.name).attributes, [key]: event.target.value })}>{attributeChoices(p.name, key)!.map(v => <option key={v}>{v}</option>)}</select></label> : null)}
      </div>;
    })}</div><div>{original('material') && material()}{original('linematerial') && material('linematerial', 'Line material')}</div></div>;
  }
  function general() {
    if (!body && !nose && !fins) return generic();
    return <div className="native-columns"><div className="native-dimensions">
      {body && <>
        {field('length', 'Length', { max: 2 })}{field('radius', 'Outer diameter', { multiplier: 2, max: .2 })}
        <NumericRow label="Inner diameter" unitKey="inner-diameter" value={String(2 * Math.max(0, radius - wall))} dimension="length" disabled={disabled || filled || !Number.isFinite(radius)} max={2 * radius} change={v => set('thickness', String(Math.max(0, Math.min(radius, radius - quantityNumber(v) / 2))))}/>
        {field('thickness', 'Wall thickness', { max: radius })}
      </>}
      {nose && <>
        {enumRow('shape', 'Nose cone shape')}{field('shapeparameter', 'Shape parameter', { slider: true, disabled: ['conical', 'ellipsoid'].includes(property('shape').value) })}
        {field('length', 'Length', { max: .7 })}{field('aftradius', 'Base diameter', { multiplier: 2, max: .2 })}
        {field('thickness', 'Wall thickness', { max: radius })}
        {checkbox('Flip to tail cone', property('isflipped', 'false').value === 'true', checked => set('isflipped', String(checked)))}
      </>}
      {fins && <>
        {field('fincount', 'Number of fins', { min: 1, max: 8, slider: false })}
        {field('cant', 'Fin cant', { min: -15, max: 15 })}
        {component.type !== 'freeformfinset' && field('rootchord', 'Root chord', { max: .5 })}
        {component.type === 'trapezoidfinset' && field('tipchord', 'Tip chord', { max: .5 })}
        {component.type !== 'freeformfinset' && field('height', 'Height', { max: .25 })}
        {component.type === 'trapezoidfinset' && <>{field('sweeplength', 'Sweep length', { min: -.5, max: .5 })}
          <NumericRow label="Sweep angle" unitKey="sweep-angle" dimension="angle" value={String(Math.atan2(number('sweeplength'), number('height')) * 180 / Math.PI)} disabled={disabled} min={-89} max={89} change={v => {
            const angle = quantityNumber(v);set('sweeplength', String(Math.tan(Math.max(-89, Math.min(89, angle)) * Math.PI / 180) * number('height')));
          }}/></>}
        {enumRow('crosssection', 'Fin cross section')}{field('thickness', 'Thickness', { max: .02 })}
      </>}
    </div><div className="native-secondary">
      {nose && <div className="nose-description">{fieldRule(component.type, 'shape')?.labels?.[property('shape').value] ?? 'Nose cone'} profile. The shape and its parameter control the contour from the tip to the base.</div>}
      {fins && placement()}{material()}
      {fins && <fieldset className="native-group"><legend>Root fillets</legend>{field('filletradius', 'Fillet radius', { max: .03 })}{material('filletmaterial', 'Fillet material', true)}</fieldset>}
    </div></div>;
  }
  function shoulder() {
    return <div className="native-columns">{(nose ? ['aft'] : ['fore', 'aft']).map(end => <fieldset className="native-group" key={end}><legend>{nose ? 'Shoulder' : end === 'fore' ? 'Fore shoulder' : 'Aft shoulder'}</legend>
      {field(`${end}shoulderradius`, 'Shoulder diameter', { multiplier: 2, max: .1 })}{field(`${end}shoulderlength`, 'Shoulder length', { max: .1 })}{field(`${end}shoulderthickness`, 'Shoulder thickness', { max: .01 })}
      {checkbox('Capped', property(`${end}shouldercapped`, 'false').value === 'true', checked => set(`${end}shouldercapped`, String(checked)))}
    </fieldset>)}</div>;
  }
  function override() {
    return <div className="native-overrides">{([['overridemass', 'Override mass', 'Mass', 'mass', 'mass'], ['overridecg', 'Override center of gravity', 'Center of gravity', 'length', 'cg'], ['overridecd', 'Override drag coefficient', 'Drag coefficient', undefined, 'cd']] as const).map(([key, label, fieldLabel, dimension, suffix]) => {
      const p = property(key), enabled = !p.remove && (!!original(key) || !!draft[key]);
      return <fieldset className="native-group" key={key}><legend>{checkbox(label, enabled, checked => {
        if (checked) set(key, p.value); else remove(key);
      })}</legend><NumericRow label={fieldLabel} unitKey={key} value={p.value} dimension={dimension} disabled={disabled || !enabled} min={key === 'overridecg' ? -1 : 0} slider={false} change={value => set(key, value)}/>
        {checkbox('Override all subcomponents', property(`overridesubcomponents${suffix}`, 'false').value === 'true' && !property(`overridesubcomponents${suffix}`).remove, checked => set(`overridesubcomponents${suffix}`, String(checked)), disabled || !enabled)}
      </fieldset>;
    })}</div>;
  }
  async function save() {
    setError('');
    const changes = Object.values(draft).filter(p => !p.remove || !!original(p.name));
    for (const [key, suffix] of [['overridemass', 'mass'], ['overridecg', 'cg'], ['overridecd', 'cd']]) if (draft[key]?.remove) {
      const flagName = `overridesubcomponents${suffix}`, pending = changes.findIndex(p => p.name === flagName);
      if (pending >= 0) changes.splice(pending, 1);
      const flag = original(flagName);
      if (flag) changes.push({ ...flag, remove: true });
    }
    if (await edit({ type: 'componentProperties', expectedHash: document.hash, id: component.id!, name, changes })) close();
    else setError('Changes could not be saved. Review the values and try again.');
  }
  const massUnit = useEditorUnit('component-mass', 'mass');
  return <div className="native-editor" onKeyDown={event => {
    if (active !== 'Advanced' && event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'range') { event.preventDefault();void save(); }
  }}>
    {active !== 'Advanced' && <label className="native-name"><span>Component name:</span><input aria-label="Component name" maxLength={LIMITS.name} disabled={disabled} value={name} onChange={event => setName(event.target.value)}/></label>}
    <div role="tablist" aria-label="Component properties" className="component-tabs">{tabs.map((name, index) => <button key={name} role="tab" id={`component-tab-${index}`} aria-controls={`component-panel-${index}`} aria-selected={active === name} tabIndex={active === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault();setTab(tabs[next]);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus(); }
    }}>{name}</button>)}</div>
    <div className="native-tab-content" role="tabpanel" id={`component-panel-${tabs.indexOf(active)}`} aria-labelledby={`component-tab-${tabs.indexOf(active)}`}>
      {active === 'General' && general()}
      {active === 'Shoulder' && shoulder()}
      {active === 'Fin tabs' && <fieldset className="native-group"><legend>Through-the-wall fin tabs</legend>{field('tablength', 'Tab length', { max: .3 })}{field('tabheight', 'Tab height', { max: .1 })}{field('tabposition', 'Tab position', { min: -.3, max: .3 })}
        <label className="native-choice"><span>Position relative to:</span><select aria-label="Tab position relative to" disabled={disabled} value={property('tabposition', '0', { relativeto: 'middle' }).attributes.relativeto ?? 'middle'} onChange={event => set('tabposition', property('tabposition').value, { relativeto: event.target.value })}><option value="top">Front of the fin</option><option value="middle">Center of the fin</option><option value="bottom">Rear of the fin</option></select></label>
      </fieldset>}
      {active === 'Override' && override()}
      {active === 'Appearance' && <fieldset className="native-group"><legend>2D drawing style</legend>{enumRow('linestyle', 'Line style', 'solid')}
        {['red', 'green', 'blue'].filter(channel => property('color', '', { red: '128', green: '128', blue: '128' }).attributes[channel] !== undefined).map(channel => <NumericRow key={channel} label={title(channel)} value={property('color', '', { red: '128', green: '128', blue: '128' }).attributes[channel]} disabled={disabled} max={255} integer change={value => set('color', '', { ...property('color', '', { red: '128', green: '128', blue: '128' }).attributes, [channel]: value })}/>)}
      </fieldset>}
      {active === 'Comment' && <label className="native-stacked">Comment<textarea aria-label="Component comment" disabled={disabled} value={property('comment', '').value} onChange={event => set('comment', event.target.value)}/></label>}
      {active === 'Motor' && <fieldset className="native-group"><legend>Motor configuration</legend><p>{document.motorMounts.some(m => m.id === component.id) ? 'This component is a motor mount.' : 'Motor assignments are managed in Motors & Configuration.'}</p><button onClick={motors} disabled={busy}>Open Motors & Configuration</button></fieldset>}
      {active === 'Advanced' && <Properties key={document.hash} component={component} expectedHash={document.hash} unit={unit} editable={editable} busy={busy} edit={edit}/>}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="native-editor-footer">
      <div className="component-mass"><span className="info-icon" aria-hidden="true">i</span><span>Component mass: {component.tube ? `${Number((component.tube.state.mass / massUnit.factor).toPrecision(6))} ${quantityUnits.mass.find(u => u.id === massUnit.unit)!.label}` : '—'}</span></div>
      {active === 'Advanced' ? <button onClick={close}>Close</button> : <><button onClick={close} disabled={busy}>Cancel</button><button className="primary" disabled={disabled} onClick={() => void save()}>OK</button></>}
    </div>
  </div>;
}
