import metadata from '../../build/components/plot-metadata.json' with { type: 'json' };
import type { StoredPlot } from './saved';
import { lengthUnits } from '../units.ts';

export const plotTypes = metadata.types;
export const plotEvents = metadata.events;
export const plotStyles = metadata.styles;
export type PlotType = typeof plotTypes[number];
export type PlotAxis = 'Auto' | 'Left' | 'Right';
export interface Appearance { color: string; style: string }
export interface PlotRow extends Appearance { id: number; type: string; unit: string; axis: PlotAxis }
export const plotColors = ['#0072b2', '#d55e00', '#b18600', '#009e73', '#cc79a7', '#3686b5'];
export const defaultEvents = ['IGNITION', 'BURNOUT', 'APOGEE', 'RECOVERY_DEVICE_DEPLOYMENT', 'STAGE_SEPARATION', 'GROUND_HIT', 'TUMBLE', 'EXCEPTION', 'SIM_WARN', 'SIM_ABORT'];
// Same nine configurations as SimulationPlotConfiguration.DEFAULT_CONFIGURATIONS.
export const plotPresets: { name: string; x: string; y: [string, PlotAxis][]; events?: string[] }[] = [
  { name: 'Vertical motion vs. time', x: 'time', y: [['altitude', 'Left'], ['velocity_z', 'Auto'], ['acceleration_z', 'Auto']] },
  { name: 'Total motion vs. time', x: 'time', y: [['altitude', 'Left'], ['velocity_total', 'Auto'], ['acceleration_total', 'Auto']] },
  { name: 'Flight side profile', x: 'position_x', y: [['altitude', 'Auto']] },
  { name: 'Ground track', x: 'position_x', y: [['position_y', 'Left'], ['altitude', 'Right']], events: defaultEvents.filter(e => !['STAGE_SEPARATION', 'TUMBLE'].includes(e)) },
  { name: 'Stability vs. time', x: 'time', y: [['stability', 'Left'], ['cp_location', 'Right'], ['cg_location', 'Right']] },
  { name: 'Drag coefficients vs. Mach number', x: 'mach_number', y: [['drag_coeff', 'Left'], ['friction_drag_coeff', 'Left'], ['base_drag_coeff', 'Left'], ['pressure_drag_coeff', 'Left']], events: ['EXCEPTION', 'SIM_WARN', 'SIM_ABORT'] },
  { name: 'Roll characteristics', x: 'time', y: [['roll_rate', 'Left'], ['roll_moment_coeff', 'Right'], ['roll_forcing_coeff', 'Right'], ['roll_damping_coeff', 'Right']], events: [...defaultEvents, 'LAUNCHROD'] },
  { name: 'Angle of attack and orientation vs. time', x: 'time', y: [['aoa', 'Left'], ['orientation_phi', 'Auto'], ['orientation_theta', 'Auto']] },
  { name: 'Simulation time step and computation time', x: 'time', y: [['time_step', 'Auto'], ['computation_time', 'Auto']] },
];
export function canonicalPlotType(name: string) {
  const normalized = name.trim().toLowerCase();
  return plotTypes.find(t => t.id === normalized || t.name.toLowerCase() === normalized)?.id ?? normalized;
}
export function channel(plot: StoredPlot, type: string): (number | null)[] {
  return plot.channels?.[type] ?? (type === 'time' ? plot.points.map(p => p[0]) : type === 'altitude' ? plot.points.map(p => p[1]) : []);
}
export function typeInfo(id: string): PlotType {
  const type = plotTypes.find(t => t.id === id);
  // Retain the existing graph's small length units alongside the desktop distance choices.
  if (type?.preference === 'DISTANCE') return { ...type, units: [...type.units, ...lengthUnits.filter(u => !type.units.some(unit => unit.id === u.id)).map(u => ({ id: u.id, scale: 1 / u.metres, offset: 0 }))] };
  return type ?? { id, name: id, group: 'Stored variables', preference: '', defaultUnit: 'as recorded', units: [{ id: 'as recorded', scale: 1, offset: 0 }] };
}
export function convertPlot(value: number, type: string, unit: string) {
  const conversion = typeInfo(type).units.find(u => u.id === unit)!;
  return value * conversion.scale + conversion.offset;
}
export function plotPoints(plot: StoredPlot, x: string, xUnit: string, row: PlotRow): ([number, number] | null)[] {
  const xs = channel(plot, x), ys = channel(plot, row.type);
  return xs.map((value, index) => value != null && ys[index] != null && Number.isFinite(value) && Number.isFinite(ys[index])
    ? [convertPlot(value, x, xUnit), convertPlot(ys[index]!, row.type, row.unit)] : null);
}
export function extent(values: number[]): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const value of values) if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
  if (min === Infinity) return [0, 1];
  if (min === max) { const padding = Math.abs(min) * .05 || 1; return [min - padding, max + padding]; }
  return [min, max];
}
export function eventX(plot: StoredPlot, time: number, x: string): number | null {
  const times = channel(plot, 'time'), values = channel(plot, x);
  if (x === 'time') return time;
  for (let i = 0; i < times.length; i++) {
    if (times[i] === time && values[i] != null) return values[i];
    const previous = times[i - 1], next = times[i], a = values[i - 1], b = values[i];
    if (previous != null && next != null && previous < time && time < next && a != null && b != null) return a + (b - a) * (time - previous) / (next - previous);
  }
  return null;
}

// Desktop's two-axis range fitting and goodness weights (PlotConfiguration).
export function fitPlotAxes(rows: PlotRow[], plots: StoredPlot[]) {
  const ranges = rows.map(row => {
    const values = plots.flatMap(plot => channel(plot, row.type).filter((v): v is number => v != null && Number.isFinite(v)).map(v => convertPlot(v, row.type, row.unit)));
    if (!values.length) return null;
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value);max = Math.max(max, value); }
    return [min, max] as [number, number];
  });
  function fit(axes: number[]): ([number, number] | null)[] {
    const bounds = [0, 1].map(axis => {
      const values = ranges.flatMap((range, i) => axes[i] === axis && range ? range : []);
      if (!values.length) return null;
      let min = Math.min(...values), max = Math.max(...values);
      if (min === max) { min -= 1;max += 1; }
      const padding = (max - min) * .03;min -= padding;max += padding;
      if (Math.min(Math.abs(min), Math.abs(max)) <= (max - min) * .3) { min = Math.min(min, 0);max = Math.max(max, 0); }
      return [min, max] as [number, number];
    });
    const [left, right] = bounds;
    if (left && right && left[0] <= 0 && left[1] >= 0 && right[0] <= 0 && right[1] >= 0) {
      const a = -left[0] / (left[1] - left[0]), b = -right[0] / (right[1] - right[0]);
      if (a > b && a < 1) right[0] = -right[1] * a / (1 - a);
      else if (a > 0) right[1] = right[0] * (-1 / a + 1);
    }
    return bounds;
  }
  let best: number[] = rows.map(row => row.axis === 'Right' ? 1 : 0), bestScore = -Infinity;
  function search(index: number, axes: number[]) {
    if (index < rows.length) {
      for (const axis of rows[index].axis === 'Auto' ? [0, 1] : [rows[index].axis === 'Right' ? 1 : 0]) search(index + 1, [...axes, axis]);
      return;
    }
    const bounds = fit(axes), [left, right] = bounds;
    let score = axes[0] === 0 ? 1 : 0;
    if (left && left[0] <= 0 && left[1] >= 0) { score += 2;if (right && right[0] <= 0 && right[1] >= 0) score += 40; }
    if (!left || !right) score += 50;
    ranges.forEach((range, i) => { const bound = bounds[axes[i]];if (range && bound) score += Math.sqrt((range[1] - range[0]) / (bound[1] - bound[0])) * 100; });
    if (score > bestScore) { bestScore = score;best = axes; }
  }
  search(0, []);
  return { axes: best, bounds: fit(best).map(bound => bound ?? [0, 1] as [number, number]) };
}
