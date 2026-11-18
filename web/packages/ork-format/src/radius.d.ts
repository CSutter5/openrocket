import type { ExpandedArchive } from './index.js';
/** Bounded intrinsic projection; not a full rocket or the product model schema. */
export interface TubeRadiusInput {
  schema: 1; componentId: string; preset?: ProofPreset;
  length: number; radius: number; thickness: number; filled: boolean; density: number;
}
export interface IntrinsicTubeState {
  radius: number; thickness: number; automatic: false; preset: false; mass: number; cg: number;
}
export interface PresetTubeState extends Omit<IntrinsicTubeState, 'preset'> {
  preset: boolean; presetDigest: string | null; length: number; density: number;
  filled: boolean; innerRadius: number; volume: number; listeners: number;
}
export function tubeRadiusInput(archive: ExpandedArchive, id: string): TubeRadiusInput;
export function radiusSimulationEffects(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState | PresetTubeState): { index: number; before: string; after: 'outdated' }[];
export function applyTubeRadius(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState | PresetTubeState): Promise<ExpandedArchive>;
export interface ProofPreset { key: string; type: string; manufacturer: string; partno: string; digest: string }
export const PROOF_PRESETS: readonly ProofPreset[];
