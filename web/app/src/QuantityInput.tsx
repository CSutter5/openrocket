import { createContext, useContext, useState } from 'react';
import { convertQuantityText, defaultQuantityUnit, quantityUnits, quantityPreferences, quantityUnitId, type Dimension } from './quantities';
import type { LengthUnit } from './units';
import { PreferencesContext } from './PreferencesContext';

export const EditorUnits = createContext<{ length: LengthUnit; units: Record<string, string>; choose: (key: string, unit: string) => void }>({ length: 'm', units: {}, choose: () => {} });
export function useEditorUnit(key: string, dimension: Dimension) {
  const context = useContext(EditorUnits), options = quantityUnits[dimension];
  const preferences = useContext(PreferencesContext), group = quantityPreferences[dimension];
  const savedDefault = preferences && group ? quantityUnitId(preferences.units[group]) : undefined;
  const preference = context.units[key], unit = options.some(u => u.id === preference) ? preference : savedDefault && options.some(u => u.id === savedDefault) ? savedDefault : defaultQuantityUnit(dimension, context.length);
  return { unit, options, factor: options.find(u => u.id === unit)!.factor, choose: (unit: string) => context.choose(key, unit) };
}
export function QuantityInput({ value, change, dimension, label, unitKey, disabled, numeric = false }: {
  value: string; change: (value: string) => void; dimension: Dimension; label: string; unitKey: string; disabled?: boolean; numeric?: boolean;
}) {
  const selected = useEditorUnit(unitKey, dimension);
  const [draft, setDraft] = useState({ text: convertQuantityText(value, selected.factor, true), canonical: value, unit: selected.unit });
  const text = draft.canonical === value && draft.unit === selected.unit ? draft.text : convertQuantityText(value, selected.factor, true);
  return <span className="quantity-input">
    <input aria-label={label} type={numeric ? 'number' : 'text'} step="any" inputMode="decimal" value={text} disabled={disabled} onChange={event => {
      const text = event.target.value, canonical = text === convertQuantityText(value, selected.factor, true) ? value : convertQuantityText(text, selected.factor, false);
      setDraft({ text, canonical, unit: selected.unit });change(canonical);
    }}/>
    <select aria-label={`${label} unit`} value={selected.unit} disabled={disabled} onChange={event => {
      // Unit selection changes display only, retaining the exact canonical draft.
      const unit = event.target.value, factor = selected.options.find(u => u.id === unit)!.factor;
      setDraft({ text: convertQuantityText(value, factor, true), canonical: value, unit });selected.choose(unit);
    }}>{selected.options.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
  </span>;
}
