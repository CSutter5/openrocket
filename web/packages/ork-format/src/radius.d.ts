import type { ExpandedArchive, XmlNode } from './index.js';
/** Bounded intrinsic projection; not a full rocket or the product model schema. */
export interface TubeRadiusInput {
  schema: 1; componentId: string; preset?: ProofPreset; ring?: RingInput; configurationIds?: string[];
  length: number; radius: number; thickness: number; filled: boolean; density: number;
}
export interface IntrinsicTubeState {
  radius: number; thickness: number; automatic: false; preset: false; mass: number; cg: number;
}
export interface PresetTubeState extends Omit<IntrinsicTubeState, 'preset'> {
  preset: boolean; presetDigest: string | null; length: number; density: number;
  filled: boolean; innerRadius: number; volume: number; listeners: number;
}
export interface RingInput {
  componentId: string; parentId: string; length: number; innerRadius: number; density: number;
  innerAutomatic?: true; precedingNoseLength?: number; sibling?: SiblingInput;
  axialOffset: number; axialMethod: 'TOP'; radialPosition: 0; radialDirection: 0; instanceCount: 1; instanceSeparation: 0;
}
export interface SiblingInput {
  componentId: string; parentId: string; length: number; outerRadius: number; thickness: number; density: number;
  axialOffset: number; axialMethod: 'TOP'; radialPosition: 0; radialDirection: 0; instanceCount: 1;
  clusterConfiguration: 'single'; clusterScale: 1; clusterRotation: 0;
}
export interface RingState {
  outerRadius: number; innerRadius: number; mass: number; cg: number; thickness: number;
  outerAutomatic: true; innerAutomatic: boolean; preset: false; listeners: 0;
  length: number; density: number; cgMass: number;
  longitudinalUnitInertia: number; rotationalUnitInertia: number;
  axialMethod: 'TOP'; axialOffset: number; positionX: number;
  radialPosition: 0; radialDirection: 0; instanceCount: 1; instanceSeparation: 0;
  bounds: [number, number, number, number, number, number];
}
export interface AutomaticRingTubeState extends PresetTubeState { ring: RingState; sibling?: Record<string, unknown> }
export function tubeRadiusInput(archive: ExpandedArchive, id: string): TubeRadiusInput;
export function validateTubeRadiusEdit(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState): void;
export function radiusSimulationEffects(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState): { index: number; before: string; after: 'outdated' }[];
export function applyTubeRadius(archive: ExpandedArchive, input: TubeRadiusInput, effects: IntrinsicTubeState | PresetTubeState | AutomaticRingTubeState): Promise<ExpandedArchive>;
export interface ProofPreset { key: string; type: string; manufacturer: string; partno: string; digest: string }
export const PROOF_PRESETS: readonly ProofPreset[];

export function field(archive: ExpandedArchive, component: XmlNode, name: string): { node: XmlNode; raw: string; text: string };
export function numeric(text: string, name: string): number;
export function replaceSpans(archive: ExpandedArchive, replacements: { start: number; end: number; text: string }[]): Promise<ExpandedArchive>;
export function simulationStatusChanges(archive: ExpandedArchive, affected: (node: XmlNode) => boolean): { index: number; before: string; after: string; start: number; end: number }[];
