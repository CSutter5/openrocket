import {useState} from 'react';
import type {Action, ComponentView} from './model';
const fields = [
  {property:'length', label:'BodyTube length (m)', max:100, zero:false},
  {property:'thickness', label:'Wall thickness (m)', max:1, zero:true},
] as const;
export function TubeProperties({component,busy,editable,edit}: {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void}) {
  return <section aria-label="Additional tube dimensions"><h3>Additional tube dimensions</h3>
    <div className="property-grid">{fields.map(field => <Property key={field.property} {...field} component={component} busy={busy} editable={editable} edit={edit}/>)}</div>
    <p className="muted">{component.extraProperties ? 'Java applies each change. Wall thickness is clamped to the radius and makes a filled tube hollow. A length edit retains a known preset; wall changes clear it. Material density remains read-only; catalog/history effects are not yet supported.' : `Read-only: ${component.extraPropertiesReason}`}</p>
  </section>;
}
function Property({property,label,max,zero,component,busy,editable,edit}: typeof fields[number] & {component:ComponentView;busy:boolean;editable:boolean;edit:(action:Action)=>void}) {
  const initial = component.tube!.input[property];
  const disabled = busy || !editable || !component.extraProperties;
  const [value,setValue]=useState(String(initial)),[error,setError]=useState('');
  return <form noValidate onSubmit={event => {
    event.preventDefault(); const number=value.trim()==='' ? NaN : Number(value);
    if(!Number.isFinite(number) || (zero ? number<0 : number<=0) || number>max) {setError(`Enter a finite value ${zero ? 'at least 0' : 'greater than 0'} and at most ${max}. Accepted document retained.`);return;}
    setError('');edit({type:'tubeProperty',id:component.id!,property,expected:initial,value:number});
  }}><label>{label}<input type="text" inputMode="decimal" value={value} disabled={disabled} aria-invalid={!!error} onChange={event=>setValue(event.target.value)}/></label>
    <button disabled={disabled}>Apply {property==='thickness' ? 'wall thickness' : property}</button>
    {error&&<p role="alert" className="error">{error}</p>}
  </form>;
}
