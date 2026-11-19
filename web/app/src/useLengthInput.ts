import {useState} from 'react';
import {lengthInput, metresFromLength, type LengthUnit} from './units';

export function useLengthInput(acceptedMetres: number, unit: LengthUnit) {
  // Keep the physical draft once; changing display units never round-trips it.
  const [draft, setDraft] = useState({text: lengthInput(acceptedMetres, unit), unit, metres: acceptedMetres});
  const text = draft.unit === unit || !Number.isFinite(draft.metres) ? draft.text : lengthInput(draft.metres, unit);
  return {
    text, metres: draft.metres,
    change(text: string) {
      const number = text.trim() === '' ? NaN : Number(text);
      setDraft({text, unit, metres: text === lengthInput(acceptedMetres, unit) ? acceptedMetres : metresFromLength(number, unit)});
    },
  };
}
