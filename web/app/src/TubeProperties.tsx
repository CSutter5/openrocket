import {useState} from 'react';
import type {Action, ComponentView} from './model';
import {lengthInput, type LengthUnit} from './units';
import {useLengthInput} from './useLengthInput';
const fields = [
  {property:'length', label:'BodyTube length', max:100, zero:false},
  {property:'thickness', label:'Wall thickness', max:1, zero:true},
] as const;
export function TubeProperties({component,busy,editable,edit,unit}: {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void;unit:LengthUnit}) {
  return <section aria-label="Additional tube dimensions"><h3>Additional tube dimensions</h3>
    <div className="property-grid">{fields.map(field => <Property key={field.property} {...field} component={component} busy={busy} editable={editable} edit={edit} unit={unit}/>)}</div>
    <p className="muted">{component.extraProperties ? 'Java applies each change. Wall thickness is clamped to the radius and makes a filled tube hollow. A length edit retains a known preset; wall changes clear it. Material density remains read-only; catalog/history effects are not yet supported.' : `Read-only: ${component.extraPropertiesReason}`}</p>
  </section>;
}
function Property({property,label,max,zero,component,busy,editable,edit,unit}: typeof fields[number] & {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void;unit:LengthUnit}) {
  const initial = component.tube!.input[property];
  const disabled = busy || !editable || !component.extraProperties;
  const value = useLengthInput(initial, unit);
  const [error,setError]=useState(false);
  return <form noValidate onSubmit={event => {
    event.preventDefault(); const number=value.metres;
    if(!Number.isFinite(number) || (zero ? number<0 : number<=0) || number>max) {setError(true);return;}
    setError(false);edit({type:'tubeProperty',id:component.id!,property,expected:initial,value:number});
  }}><label>{label} ({unit})<input type="text" inputMode="decimal" value={value.text} disabled={disabled} aria-invalid={!!error} onChange={event=>value.change(event.target.value)}/></label>
    <button disabled={disabled}>Apply {property==='thickness' ? 'wall thickness' : property}</button>
    {error&&<p role="alert" className="error">Enter a finite value {zero ? 'at least 0' : 'greater than 0'} and at most {lengthInput(max, unit)} {unit}. Accepted document retained.</p>}
  </form>;
}
