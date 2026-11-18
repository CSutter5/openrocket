import type { TubeRadiusInput, IntrinsicTubeState, PresetTubeState, AutomaticRingTubeState } from '../../packages/ork-format/src/radius.js';
export type Intrinsic = IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState;
export interface ComponentView {
  id?: string; name?: string; type: string; parent: number;
  properties: { name: string; value: string }[];
  tube?: { input: TubeRadiusInput; state: Intrinsic };
  radiusReason?: string;
}
export interface DocumentView {
  filename: string; mode: 'editable' | 'preservation'; diagnostics: string[];
  hash: string; dirty: boolean; components: ComponentView[];
  simulations: { name: string; status: string }[];
}
export type Action =
  | { type: 'import'; bytes: Uint8Array; filename: string }
  | { type: 'rename'; id: string; expected: string; value: string }
  | { type: 'radius'; id: string; expected: number; value: number };
export interface Reply { view: DocumentView; notice: string }
