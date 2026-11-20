import type { IdentitySidecar } from '@openrocket/contracts';
import type { Action } from './model';
import type { PublicRocket } from './accounts';
export interface SharedSnapshot { bytes: number[]; identity: IdentitySidecar; filename: string }
export interface SharedState { token: string; snapshot: SharedSnapshot }
export type SharedMessage =
  | { type: 'deleted' }
  | { type: 'revoked' }
  | { type: 'metadata'; rocket: PublicRocket }
  | { type: 'access'; canEdit: boolean; canDownload: boolean; username: string }
  | { type: 'state'; state: SharedState; requestId?: string; notice?: string; configurationId?: string; selectedId?: string }
  | { type: 'presence'; users: string[] }
  | { type: 'rejected'; requestId: string; error: string };
export const sharedActions = new Set(['new', 'import', 'addComponent', 'componentProperty', 'componentProperties', 'componentTree', 'rename', 'radius', 'tubeProperty', 'assignMotor', 'createConfiguration', 'renameConfiguration', 'deleteConfiguration']);
export interface SharedCommand { requestId: string; expectedToken: string; action: Action }
