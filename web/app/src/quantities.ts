import { lengthUnits, type LengthUnit } from './units';

export type Dimension = 'length' | 'angle' | 'mass' | 'bulkDensity' | 'surfaceDensity' | 'lineDensity' | 'time' | 'pressure';
export interface QuantityUnit { id: string; label: string; factor: number }
const inch = .0254, ounce = .028349523125, pound = .45359237;
export const quantityUnits: Record<Dimension, QuantityUnit[]> = {
  length: lengthUnits.map(u => ({ id: u.id, label: u.id, factor: u.metres })),
  // Angles in component XML are degrees, rather than the engine's radians.
  angle: [{ id: 'deg', label: '°', factor: 1 }, { id: 'rad', label: 'rad', factor: 180 / Math.PI }],
  mass: [{ id: 'kg', label: 'kg', factor: 1 }, { id: 'g', label: 'g', factor: .001 }, { id: 'mg', label: 'mg', factor: .000001 }, { id: 'oz', label: 'oz', factor: ounce }, { id: 'lb', label: 'lb', factor: pound }],
  bulkDensity: [{ id: 'kg/m3', label: 'kg/m³', factor: 1 }, { id: 'g/cm3', label: 'g/cm³', factor: 1000 }, { id: 'oz/in3', label: 'oz/in³', factor: ounce / inch ** 3 }, { id: 'lb/ft3', label: 'lb/ft³', factor: pound / .3048 ** 3 }],
  surfaceDensity: [{ id: 'kg/m2', label: 'kg/m²', factor: 1 }, { id: 'g/m2', label: 'g/m²', factor: .001 }, { id: 'oz/yd2', label: 'oz/yd²', factor: ounce / .9144 ** 2 }],
  lineDensity: [{ id: 'kg/m', label: 'kg/m', factor: 1 }, { id: 'g/m', label: 'g/m', factor: .001 }, { id: 'oz/in', label: 'oz/in', factor: ounce / inch }],
  time: [{ id: 's', label: 's', factor: 1 }, { id: 'ms', label: 'ms', factor: .001 }, { id: 'min', label: 'min', factor: 60 }],
  pressure: [{ id: 'Pa', label: 'Pa', factor: 1 }, { id: 'kPa', label: 'kPa', factor: 1000 }, { id: 'MPa', label: 'MPa', factor: 1e6 }, { id: 'GPa', label: 'GPa', factor: 1e9 }, { id: 'psi', label: 'psi', factor: 6894.757293168 }],
};
export function defaultQuantityUnit(dimension: Dimension, length: LengthUnit) {
  return dimension === 'length' ? length : dimension === 'angle' ? 'deg' : dimension === 'mass' ? 'g' : quantityUnits[dimension][0].id;
}
const lengths = new Set(['length', 'radius', 'thickness', 'outerradius', 'innerradius', 'foreradius', 'aftradius', 'diameter', 'outerdiameter', 'innerdiameter', 'packedlength', 'packedradius', 'radialposition', 'radiusoffset', 'axialoffset', 'position', 'instanceseparation', 'rootchord', 'tipchord', 'sweeplength', 'height', 'baseheight', 'flangeheight', 'screwheight', 'filletradius', 'tablength', 'tabheight', 'tabposition', 'overhang', 'overridecg', 'linelength', 'striplength', 'stripwidth', 'deployaltitude', 'separationaltitude', 'foreshoulderradius', 'foreshoulderlength', 'foreshoulderthickness', 'aftshoulderradius', 'aftshoulderlength', 'aftshoulderthickness']);
export function propertyDimension(name: string, attribute?: string, attributes: Record<string, string> = {}): Dimension | undefined {
  if (attribute === 'density') return attributes.type === 'surface' ? 'surfaceDensity' : attributes.type === 'line' ? 'lineDensity' : 'bulkDensity';
  if (attribute === 'shearModulus') return 'pressure';
  if (attribute) return;
  if (lengths.has(name)) return 'length';
  if (['cant', 'rotation', 'angleoffset', 'radialdirection', 'clusterrotation'].includes(name)) return 'angle';
  if (['mass', 'overridemass'].includes(name)) return 'mass';
  if (['deploydelay', 'separationdelay'].includes(name)) return 'time';
}
const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
export function quantityNumber(value: string) { return decimal.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : NaN; }
export function convertQuantityText(value: string, factor: number, toDisplay: boolean) {
  const prefix = value.startsWith('auto ') ? 'auto ' : '', text = prefix ? value.slice(prefix.length) : value;
  const number = quantityNumber(text);
  if (!Number.isFinite(number)) return value;
  const result = toDisplay ? number / factor : number * factor;
  return prefix + (toDisplay ? String(Number(result.toPrecision(12))) : String(result));
}
