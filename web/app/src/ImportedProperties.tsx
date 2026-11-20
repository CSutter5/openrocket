import { useState } from 'react';
import type { Action, ComponentView } from './model';
import { fieldRule, attributeChoices } from './components';

type Property = ComponentView['properties'][number];
function PropertyField({ property, component, expectedHash, disabled, edit, label }: { property: Property; component: ComponentView; expectedHash: string; disabled: boolean; edit: (action: Action) => void; label: string }) {
  const [value, setValue] = useState(property.value), [attributes, setAttributes] = useState(property.attributes);
  const rule = fieldRule(component.type, property.name), choices = rule?.values ?? (rule?.kind === 'BooleanSetter' ? ['true', 'false'] : undefined);
  const changed = value !== property.value || Object.keys(attributes).some(k => attributes[k] !== property.attributes[k]);
  function options(values: string[], current: string) { return (values.includes(current) ? values : [current, ...values]).map(v => <option key={v} value={v}>{v || '(empty)'}</option>); }
  return <form className="imported-property" data-property={property.name} onSubmit={event => { event.preventDefault();edit({ type: 'componentProperty', expectedHash, id: component.id!, key: property.key, value, attributes }); }}>
    <fieldset disabled={disabled}><legend>{label}</legend>
      <label>Value{choices ? <select aria-label={`${label} value`} value={value} onChange={event => setValue(event.target.value)}>{options(choices, value)}</select>
        : property.name === 'comment' || value.includes('\n') ? <textarea aria-label={`${label} value`} value={value} rows={3} onChange={event => setValue(event.target.value)}/>
        : <input aria-label={`${label} value`} value={value} spellCheck={false} onChange={event => setValue(event.target.value)}/>}</label>
      {Object.entries(attributes).map(([name, text]) => {
        const choices = attributeChoices(property.name, name);
        return <label key={name}>{name}{choices ? <select aria-label={`${label} ${name}`} value={text} onChange={event => setAttributes({ ...attributes, [name]: event.target.value })}>{options(choices, text)}</select>
          : <input aria-label={`${label} ${name}`} value={text} spellCheck={false} onChange={event => setAttributes({ ...attributes, [name]: event.target.value })}/>}</label>;
      })}
      <button disabled={!changed}>Apply {label} value</button>
    </fieldset>
  </form>;
}
export function ImportedProperties({ component, expectedHash, editable, busy, edit }: { component: ComponentView; expectedHash: string; editable: boolean; busy: boolean; edit: (action: Action) => void }) {
  const counts = new Map<string, number>();
  return <details className="imported-properties" open={!component.tube}><summary>Imported properties</summary>
    <p className="muted">Archive values: lengths in meters, angles in degrees, masses in kilograms. Automatic values use “auto”; solid shells use “filled”. Apply each property to update the design.</p>
    <div className="imported-fields">{component.properties.map(property => {
      const ordinal = (counts.get(property.name) ?? 0) + 1;counts.set(property.name, ordinal);
      const label = component.properties.filter(p => p.name === property.name).length > 1 ? `${property.name} (${ordinal})` : property.name;
      return <PropertyField key={property.key} property={property} component={component} expectedHash={expectedHash} disabled={busy || !editable} edit={edit} label={label}/>;
    })}</div>
  </details>;
}
