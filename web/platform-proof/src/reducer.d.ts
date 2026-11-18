declare module '*build/generated/teavm/js/reducer.js' {
  export function radiusEdit(length: number, radius: number, thickness: number, filled: boolean, density: number, value: number): string;
  export function presetRadiusEdit(key: string, digest: string, length: number, radius: number, thickness: number, filled: boolean, density: number, value: number): string;
  export function automaticRingRadiusEdit(key: string, digest: string, length: number, radius: number, thickness: number, filled: boolean, density: number, ringLength: number, ringInner: number, ringDensity: number, offset: number, configurations: string, value: number): string;
  export function resetDeployment(event: string, altitude: number, delay: number, overrides: string, configurations: string, selected: string): string;
  export function digestVector(length: number): string;
}
