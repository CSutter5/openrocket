import type { ExpandedArchive } from './index.js';
import type { TubeRadiusInput, PresetTubeState } from './radius.js';
export type TubeProperty = 'length' | 'thickness';
export function tubePropertyInput(archive: ExpandedArchive, id: string): TubeRadiusInput;
export function applyTubeProperty(archive: ExpandedArchive, input: TubeRadiusInput, property: TubeProperty, value: number, effects: PresetTubeState, functionalChange: boolean): Promise<ExpandedArchive>;
