import {useState} from 'react';
import type {Action, ComponentView} from './model';
import {lengthInput, type LengthUnit} from './units';
import {useLengthInput} from './useLengthInput';
import {useEditorUnit} from './QuantityInput';
const fields = [
  {property:'length', label:'BodyTube length', max:100, zero:false},
  {property:'thickness', label:'Wall thickness', max:1, zero:true},
] as const;
export function TubeProperties({component,busy,editable,edit,unit}: {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void;unit:LengthUnit}) {
  return <section aria-label="Additional tube dimensions"><h3>Additional tube dimensions</h3>
    <div className="property-grid">{fields.map(field => <Property key={field.property} {...field} component={component} busy={busy} editable={editable} edit={edit} unit={unit}/>)}</div>
    <p className="muted">{component.extraProperties ? 'Wall thickness is limited to the radius and makes a filled tube hollow. Length retains a preset; wall changes clear it. Material density is read-only.' : `Read-only: ${component.extraPropertiesReason}`}</p>
  </section>;
}
function Property({property,label,max,zero,component,busy,editable,edit,unit}: typeof fields[number] & {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void;unit:LengthUnit}) {
  const initial = component.tube!.input[property];
  const disabled = busy || !editable || !component.extraProperties;
  const selectedUnit = useEditorUnit(`quick-${property}`, 'length'), fieldUnit = selectedUnit.unit as LengthUnit;
  const value = useLengthInput(initial, fieldUnit);
  const [error,setError]=useState(false);
  return <form noValidate onSubmit={event => {
    event.preventDefault(); const number=value.metres;
    if(!Number.isFinite(number) || (zero ? number<0 : number<=0) || number>max) {setError(true);return;}
    setError(false);edit({type:'tubeProperty',id:component.id!,property,expected:initial,value:number});
  }}><label>{label} ({fieldUnit})<input type="text" inputMode="decimal" value={value.text} disabled={disabled} aria-invalid={!!error} onChange={event=>value.change(event.target.value)}/></label>
    <select aria-label={`Quick ${property} unit`} value={fieldUnit} disabled={disabled} onChange={event=>selectedUnit.choose(event.target.value)}>{selectedUnit.options.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}</select>
    <button disabled={disabled}>Apply {property==='thickness' ? 'wall thickness' : property}</button>
    {error&&<p role="alert" className="error">Enter a finite value {zero ? 'at least 0' : 'greater than 0'} and at most {lengthInput(max, fieldUnit)} {fieldUnit}. Accepted document retained.</p>}
  </form>;
}
