import nativeUnits from '../build/components/preference-units.json';

export const preferenceUnits = nativeUnits;
export type UnitPreference = keyof typeof nativeUnits;
export type Theme = 'dark' | 'light' | 'contrast';
export const fontWeights = { Light: 300, Regular: 400, Medium: 500, Bold: 700 };
export interface Preferences {
  ui: { theme: Theme; scale: number; fontSize: number; fontStyle: keyof typeof fontWeights; characterSpacing: number };
  units: Record<UnitPreference, string>;
  displaySecondaryStability: boolean;
}
export interface SavedPreferences { version: number; preferences: Preferences }
export function preferredUnit(preferences: Preferences | null, group: UnitPreference, fallback: string) {
  return preferenceUnits[group].options.find(unit => unit.id === (preferences?.units[group] ?? fallback))!;
}
export function unitPreset(preset: 'metric' | 'imperial'): Preferences['units'] {
  return Object.fromEntries(Object.entries(nativeUnits).map(([key, group]) => [key, group[preset]])) as Preferences['units'];
}
export function defaultPreferences(): Preferences {
  // Retain the current web editor's initial presentation until the user chooses a preset.
  return { ui: { theme: 'dark', scale: 1, fontSize: 14, fontStyle: 'Regular', characterSpacing: 0 },
    units: { ...unitPreset('metric'), LENGTH: 'm' }, displaySecondaryStability: true };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function validPreferences(value: unknown): value is Preferences {
  if (!object(value) || !exactKeys(value, ['ui', 'units', 'displaySecondaryStability']) || !object(value.ui) || !object(value.units) || typeof value.displaySecondaryStability !== 'boolean') return false;
  const ui = value.ui, units = value.units;
  const bounded = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  return exactKeys(ui, ['theme', 'scale', 'fontSize', 'fontStyle', 'characterSpacing']) && typeof ui.theme === 'string' && ['dark', 'light', 'contrast'].includes(ui.theme) &&
    bounded(ui.scale, .5, 2) && bounded(ui.fontSize, 5, 25) && Number.isInteger(ui.fontSize) && typeof ui.fontStyle === 'string' && Object.hasOwn(fontWeights, ui.fontStyle) && bounded(ui.characterSpacing, -20, 30) &&
    exactKeys(units, Object.keys(nativeUnits)) && Object.entries(nativeUnits).every(([key, group]) => group.options.some(unit => unit.id === units[key]));
}
export function applyPreferences(preferences: Preferences) {
  const root = document.documentElement, ui = preferences.ui;
  root.dataset.theme = ui.theme;
  root.style.fontSize = `${Math.max(8, ui.fontSize * ui.scale)}px`;
  root.style.fontWeight = String(fontWeights[ui.fontStyle]);
  root.style.letterSpacing = `${ui.characterSpacing / 100}em`;
}
