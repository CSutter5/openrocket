import type { ExpandedArchive } from './index.js';
export interface DeploymentParameters { event: string; altitude: number; delay: number; listeners: number }
export interface DeploymentOverride { id: string; parameters: DeploymentParameters }
export interface DeploymentState {
  default: DeploymentParameters; overrides: DeploymentOverride[];
  effective: { id: string; inherited: boolean; parameters: DeploymentParameters }[];
}
export interface DeploymentEffects {
  before: DeploymentState; after: DeploymentState;
  functionalChange: boolean; configurationChanged: boolean[];
  rocketChanged: Record<'document' | 'mass' | 'aerodynamic' | 'tree' | 'functional', boolean>;
}
export interface DeploymentInput {
  schema: 1; componentId: string; configurationIds: string[];
  default: DeploymentParameters; overrides: DeploymentOverride[]; simulationConfigurations: string[];
}
export function deploymentInput(archive: ExpandedArchive, id: string): DeploymentInput;
export function deploymentState(input: DeploymentInput): DeploymentState;
export function deploymentSimulationEffects(archive: ExpandedArchive, input: DeploymentInput, id: string, effects: DeploymentEffects): { index: number; before: string; after: string }[];
export function applyDeploymentReset(archive: ExpandedArchive, input: DeploymentInput, id: string, effects: DeploymentEffects): Promise<ExpandedArchive>;
