import type { TubeRadiusInput, IntrinsicTubeState, PresetTubeState, AutomaticRingTubeState } from '../../packages/ork-format/src/radius.js';
export type Intrinsic = IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState;
export interface ComponentPropertyChange { key?: number; name: string; value: string; attributes: Record<string, string>; remove?: boolean }
export interface ComponentView {
  id?: string; name?: string; type: string; parent: number;
  properties: { key: number; name: string; value: string; attributes: Record<string, string> }[];
  tube?: { input: TubeRadiusInput; state: Intrinsic };
  radiusReason?: string;
  extraProperties?: boolean; extraPropertiesReason?: string;
  motorMount?: import('./motor-mount').MotorMountSettings & { reason?: string };
}
export interface DocumentView {
  flightSupport: import('./simulation/input').Support;
  flightConfigurations: import('./simulation/input').FlightConfigurationChoice[];
  flightConfigurationId?: string;
  stages: import('./staging').StageSettings[];
  motorMounts: { id: string; name: string; diameter?: number; length?: number; usedGroups: number[]; assignments: { configurationId: string; motorKey?: string; delay: string }[] }[];
  stability: { cg: number | null; cp: number | null; length?: number | null; diameter?: number | null;
    massWithoutMotors?: number | null; massWithMotors?: number | null; caliber?: number | null; aerodynamicLength?: number | null; reason?: string };
  drawing: import('./drawing').Drawing;
  filename: string; mode: 'editable' | 'preservation'; diagnostics: string[];
  identitySidecarHash: string; hash: string; dirty: boolean; components: ComponentView[];
  simulations: import('./simulation/saved').SavedSimulation[];
}
export type Action =
  | { type: 'sync'; bytes: Uint8Array; filename: string; identity: import('@openrocket/contracts').IdentitySidecar }
  | { type: 'new' }
  | { type: 'addComponent'; expectedHash: string; selectedId: string; componentType: string; position: 'after' | 'end' }
  | { type: 'componentProperty'; expectedHash: string; id: string; key: number; value: string; attributes: Record<string, string> }
  | { type: 'componentProperties'; expectedHash: string; id: string; name: string; changes: ComponentPropertyChange[]; motorMount?: import('./motor-mount').MotorMountSettings }
  | { type: 'componentTree'; expectedHash: string; id: string; operation: 'up' | 'down' | 'duplicate' | 'delete' }
  | { type: 'import'; bytes: Uint8Array; filename: string }
  | { type: 'rename'; id: string; expected: string; value: string }
  | { type: 'radius'; id: string; expected: number; value: number }
  | { type: 'tubeProperty'; id: string; property: import('../../packages/ork-format/src/tube-properties.js').TubeProperty; expected: number; value: number }
  | { type: 'flightConfiguration'; expectedHash: string; configurationId: string }
  | { type: 'staging'; expectedHash: string; configurationId: string; settings: import('./staging').StageSettings }
  | { type: 'assignMotor'; expectedHash: string; configurationId: string; mountId: string; motorKey: string; delay: string }
  | { type: 'createConfiguration'; expectedHash: string; name: string; mountId: string; motorKey: string; delay: string }
  | { type: 'renameConfiguration'; expectedHash: string; configurationId: string; name: string }
  | { type: 'deleteConfiguration'; expectedHash: string; configurationId: string }
  | { type: 'flightSnapshot'; expectedHash: string; configurationId: string; simulationId?: string; integrator: import('./simulation/provenance').Integrator }
  | { type: 'export' };
export interface Reply { view: DocumentView; notice: string; configurationId?: string; selectedId?: string; bytes?: Uint8Array; snapshot?: import('./simulation/provenance').FlightSnapshot }
