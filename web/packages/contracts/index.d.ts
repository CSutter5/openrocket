export const PROTOCOL_VERSION: 1;
export const MODEL_SCHEMA_VERSION: 1;
export const DESKTOP_REVISION: string;
export type Sha256 = string;
export interface WorkspaceRef {
  projectId: string;
  branchId: string;
  epoch: number;
}
/** All dimensional quantities in the editing projection use SI units. */
export type Edit =
  | { type: 'setName'; componentId: string; value: string }
  | { type: 'setOuterRadius'; componentId: string; value: number }
  | { type: 'move'; componentId: string; parentId: string; index: number }
  | { type: 'selectConfiguration'; configurationId: string };
export interface Command extends WorkspaceRef {
  protocol: 1;
  modelSchema: 1;
  operationId: string;
  observedSequence: number;
  /** Expected values for the reducer's complete read/write effect set, including derived fields. */
  preconditions: { entityId: string; field: string; expected: unknown }[];
  edit: Edit;
}
export interface AcceptedCommand extends WorkspaceRef {
  protocol: 1;
  operationId: string;
  sequence: number;
  authorId: string;
  effects: { entityId: string; field: string; before: unknown; after: unknown }[];
}
export interface Diagnostic {
  code: 'invalid' | 'unsupported' | 'version' | 'conflict' | 'forbidden' | 'resync';
  message: string;
  path?: string;
}
export interface ArchiveEntry { path: string; bytes: Uint8Array; }
export interface IdentitySidecar {
  schema: 1;
  components: Record<string, string>;
  simulations: { id: string; fingerprint: Sha256 }[];
}
export interface ExpandedArchive {
  codecVersion: 1;
  original: Uint8Array;
  entries: ArchiveEntry[];
  mode: 'editable' | 'preservation';
  diagnostics: Diagnostic[];
}
export interface SimulationInput {
  schema: 1;
  desktopRevision: string;
  engineHash: Sha256;
  motorCatalogHash: Sha256;
  materialCatalogHash: Sha256;
  archiveTreeHash: Sha256;
  identitySidecarHash: Sha256;
  simulationId: string;
  configurationId: string;
  optionsHash: Sha256;
  extensionSetHash: Sha256;
  seed: number;
  integrator: 'RK4' | 'RK6';
}
export interface CompletedResult extends WorkspaceRef {
  schema: 1;
  inputHash: Sha256;
  outputHash: Sha256;
  authorId: string;
  source: 'browser-client';
  status: 'completed';
}
export function negotiateProtocol(offered: unknown): 1;
export function simulationInputHash(input: SimulationInput): Promise<Sha256>;
export function resultIsCurrent(result: CompletedResult, currentInput: SimulationInput): Promise<boolean>;
