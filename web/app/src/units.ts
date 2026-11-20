export const INCH_METRES = 0.0254;
export const lengthUnits = [
  { id: 'mm', label: 'Millimeters', metres: .001 },
  { id: 'cm', label: 'Centimeters', metres: .01 },
  { id: 'm', label: 'Meters', metres: 1 },
  { id: 'km', label: 'Kilometers', metres: 1000 },
  { id: 'in', label: 'Inches', metres: INCH_METRES },
  { id: 'ft', label: 'Feet', metres: .3048 },
  { id: 'yd', label: 'Yards', metres: .9144 },
  { id: 'mi', label: 'Miles', metres: 1609.344 },
] as const;
export type LengthUnit = typeof lengthUnits[number]['id'];
export function displayLength(metres: number, unit: LengthUnit): number {
  return metres / lengthUnits.find(u => u.id === unit)!.metres;
}
export function metresFromLength(value: number, unit: LengthUnit): number {
  return value * lengthUnits.find(u => u.id === unit)!.metres;
}
export function lengthInput(metres: number, unit: LengthUnit): string {
  return Number.isFinite(metres) ? String(displayLength(metres, unit)) : '';
}
export function lengthLabel(metres: number, unit: LengthUnit): string {
  return `${displayLength(metres, unit).toPrecision(6)} ${unit}`;
}
