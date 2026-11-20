import type { CatalogMotor } from './motor-catalog';
export const impulseClasses = 'ABCDEFGHIJKLMNO'.split('');
// Native desktop MotorFilterPanel nominal/actual stops, in metres.
export const diameters = [0, .006, .013, .018, .024, .029, .032, .038, .054, .075, .098, 1];
const actualDiameters = [0, .006, .013, .018, .024, .029, .032, .0381, .054, .0763, .0983, 1];
export interface MotorFilters {
  search: string; manufacturers: string[] | null; hideUsed: boolean; hideUnavailable: boolean; hideSimilar: boolean;
  minImpulse: number; maxImpulse: number; minDiameter: number; maxDiameter: number;
  minLength: string; maxLength: string; fitDiameter: boolean; fitLength: boolean;
}
export const defaultFilters: MotorFilters = { search: '', manufacturers: null, hideUsed: false, hideUnavailable: true, hideSimilar: true, minImpulse: 0, maxImpulse: 14, minDiameter: 0, maxDiameter: 11, minLength: '', maxLength: '', fitDiameter: false, fitLength: false };
export interface FilterMount { diameter?: number; length?: number; usedGroups: number[] }
export function mountDiameterStop(diameter: number) {
  let i = 0;while (i < actualDiameters.length && diameter >= actualDiameters[i] - .0005) i++;
  if (i >= actualDiameters.length) i--;
  return Math.max(0, i - 1);
}
export function filterMotors(motors: CatalogMotor[], filters: MotorFilters, mount?: FilterMount, selected?: CatalogMotor) {
  const usedGroups = new Set(mount?.usedGroups ?? []);
  const maxDiameter = filters.fitDiameter && mount?.diameter !== undefined ? mountDiameterStop(mount.diameter) : filters.maxDiameter;
  const minLength = filters.minLength.trim() ? Number(filters.minLength) / 1000 : 0;
  const maxLength = filters.fitLength && mount?.length !== undefined ? mount.length : filters.maxLength.trim() ? Number(filters.maxLength) / 1000 : Infinity;
  if (!Number.isFinite(minLength) || Number.isNaN(maxLength) || minLength < 0 || maxLength < minLength) return [];
  const terms = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return motors.filter(m => {
    if (filters.manufacturers !== null && !filters.manufacturers.includes(m.manufacturer)) return false;
    if (filters.hideUnavailable && !m.available || filters.hideUsed && usedGroups.has(m.group)) return false;
    if (filters.hideSimilar && selected?.similar.includes(m.key)) return false;
    if (m.filterImpulse <= (filters.minImpulse === 0 ? -1 : 2.5 * 2 ** (filters.minImpulse - 1)) || m.filterImpulse > (filters.maxImpulse === 14 ? Infinity : 2.5 * 2 ** filters.maxImpulse)) return false;
    if (m.diameter <= diameters[filters.minDiameter] - .0015 || m.diameter >= diameters[maxDiameter] + .0004) return false;
    if (m.length < minLength || m.length > maxLength) return false;
    const text = `${m.manufacturer} ${m.designation} ${m.commonName} ${m.caseInfo ?? ''} ${m.filterImpulse} ${m.diameter * 1000} ${m.length * 1000}`.toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
