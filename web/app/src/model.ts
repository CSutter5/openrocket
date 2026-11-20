import type { TubeRadiusInput, IntrinsicTubeState, PresetTubeState, AutomaticRingTubeState } from '../../packages/ork-format/src/radius.js';
export type Intrinsic = IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState;
export interface ComponentView {
  id?: string; name?: string; type: string; parent: number;
  properties: { name: string; value: string }[];
  tube?: { input: TubeRadiusInput; state: Intrinsic };
  radiusReason?: string;
  extraProperties?: boolean; extraPropertiesReason?: string;
}
export interface DocumentView {
  flightSupport: import('./simulation/input').Support;
  flightConfigurations: import('./simulation/input').FlightConfigurationChoice[];
  flightConfigurationId?: string;
  motorMounts: { id: string; name: string; diameter?: number; length?: number; usedGroups: number[]; assignments: { configurationId: string; motorKey?: string; delay: string }[] }[];
  drawing: import('./drawing').Drawing;
  filename: string; mode: 'editable' | 'preservation'; diagnostics: string[];
  identitySidecarHash: string; hash: string; dirty: boolean; components: ComponentView[];
  simulations: import('./simulation/saved').SavedSimulation[];
}
export type Action =
  | { type: 'import'; bytes: Uint8Array; filename: string }
  | { type: 'rename'; id: string; expected: string; value: string }
  | { type: 'radius'; id: string; expected: number; value: number }
  | { type: 'tubeProperty'; id: string; property: import('../../packages/ork-format/src/tube-properties.js').TubeProperty; expected: number; value: number }
  | { type: 'flightConfiguration'; expectedHash: string; configurationId: string }
  | { type: 'assignMotor'; expectedHash: string; configurationId: string; mountId: string; motorKey: string; delay: string }
  | { type: 'createConfiguration'; expectedHash: string; name: string; mountId: string; motorKey: string; delay: string }
  | { type: 'renameConfiguration'; expectedHash: string; configurationId: string; name: string }
  | { type: 'deleteConfiguration'; expectedHash: string; configurationId: string }
  | { type: 'flightSnapshot'; expectedHash: string; configurationId: string; simulationId?: string; integrator: import('./simulation/provenance').Integrator }
  | { type: 'export' };
export interface Reply { view: DocumentView; notice: string; bytes?: Uint8Array; snapshot?: import('./simulation/provenance').FlightSnapshot }
