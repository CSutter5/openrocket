import type { ExpandedArchive } from './index.js';
/** Bounded intrinsic projection; not a full rocket or the product model schema. */
export interface TubeRadiusInput {
  schema: 1; componentId: string;
  length: number; radius: number; thickness: number; filled: boolean; density: number;
}
export interface IntrinsicTubeState {
  radius: number; thickness: number; automatic: false; preset: false; mass: number; cg: number;
}
export function tubeRadiusInput(archive: ExpandedArchive, id: string): TubeRadiusInput;
export function radiusSimulationEffects(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState): { index: number; before: string; after: 'outdated' }[];
export function applyTubeRadius(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState): Promise<ExpandedArchive>;
