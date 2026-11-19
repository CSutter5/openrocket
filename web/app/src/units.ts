export type LengthUnit = 'm' | 'in';
export const INCH_METRES = 0.0254;
export function displayLength(metres: number, unit: LengthUnit): number {
  return unit === 'in' ? metres / INCH_METRES : metres;
}
export function metresFromLength(value: number, unit: LengthUnit): number {
  return unit === 'in' ? value * INCH_METRES : value;
}
export function lengthInput(metres: number, unit: LengthUnit): string {
  return Number.isFinite(metres) ? String(displayLength(metres, unit)) : '';
}
export function lengthLabel(metres: number, unit: LengthUnit): string {
  return `${displayLength(metres, unit).toPrecision(6)} ${unit}`;
}
