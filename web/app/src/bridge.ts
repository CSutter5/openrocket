import { sharedActions, type SharedMessage, type SharedState } from './coediting';
import type { Action, Reply } from './model';
const worker = new Worker(new URL('./document.worker.ts', import.meta.url), { type: 'module' });
let sequence = 0, fatal = false;
const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
worker.onmessage = ({ data }) => {
  const request = pending.get(data.id);
  if (!request) return;
  pending.delete(data.id);
  if (data.error) request.reject(new Error(data.error));
  else request.resolve(data.result);
};
worker.onerror = () => {
  fatal = true;
  for (const request of pending.values()) request.reject(new Error('Document worker unavailable. Reload and reopen your local file.'));
  pending.clear();
};
function localRequest(action: Action): Promise<Reply> {
  if (fatal) return Promise.reject(new Error('Document worker unavailable. Reload and reopen your local file.'));
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action });
  });
}

export interface CollaborationStatus { phase: 'local' | 'joining' | 'connected' | 'reconnecting' | 'deleted' | 'revoked'; username: string; users: string[]; canEdit: boolean; canDownload: boolean }
let collaboration: CollaborationStatus = { phase: 'local', username: '', users: [], canEdit: false, canDownload: false };
let state: SharedState | undefined, socket: WebSocket | undefined;
let messages = Promise.resolve();
const sharedPending = new Map<string, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
const listeners = new Set<(status: CollaborationStatus, reply?: Reply) => void>();
function publish(reply?: Reply) { for (const listener of listeners) listener(collaboration, reply); }
export function subscribeCollaboration(listener: (status: CollaborationStatus, reply?: Reply) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export async function collaborationAvailable() {
  const response = await fetch('/api/coedit');
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Shared editing unavailable. Reload to retry.');
  if (!response.headers.get('content-type')?.includes('application/json')) return false;
  return (await response.json()).enabled === true;
}
export function connectShared(owner: string, slug: string, rocketId: string): Promise<void> {
  collaboration = { phase: 'joining', username: '', users: [], canEdit: false, canDownload: false }; publish();
  return new Promise(resolve => {
    function unavailable(phase: 'deleted' | 'revoked') {
      state = undefined;collaboration = { ...collaboration, phase, canEdit: false, canDownload: false, users: [] };
      for (const pending of sharedPending.values()) pending.reject(new Error(phase === 'deleted' ? 'This rocket was deleted' : 'Access to this rocket was revoked'));
      sharedPending.clear();publish();resolve();
    }
    function connect() {
      const url = new URL(`/api/rockets/${owner}/${slug}/socket`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('rocketId', rocketId);
      const connection = new WebSocket(url);
      socket = connection;
      connection.onmessage = event => {
        messages = messages.then(async () => {
          if (socket !== connection) return;
          const message = JSON.parse(event.data) as SharedMessage;
          if (message.type === 'deleted' || message.type === 'revoked') { unavailable(message.type);connection.close();return; }
          if (message.type === 'metadata') { window.dispatchEvent(new CustomEvent('rocket-metadata', { detail: message.rocket }));return; }
          if (message.type === 'access') { collaboration = { ...collaboration, canEdit: message.canEdit, canDownload: message.canDownload, username: message.username };publish();return; }
          if (message.type === 'presence') { collaboration = { ...collaboration, users: message.users }; publish(); return; }
          if (message.type === 'rejected') {
            sharedPending.get(message.requestId)?.reject(new Error(message.error)); sharedPending.delete(message.requestId); return;
          }
          let reply = await localRequest({ type: 'sync', ...message.state.snapshot, bytes: new Uint8Array(message.state.snapshot.bytes) });
          if (socket !== connection || connection.readyState !== WebSocket.OPEN) return;
          if (message.configurationId && reply.view.flightConfigurationId !== message.configurationId) reply = await localRequest({ type: 'flightConfiguration', expectedHash: reply.view.hash, configurationId: message.configurationId });
          state = message.state;
          reply.notice = message.notice ?? 'Shared file opened. Edits are saved for everyone.';
          reply.selectedId = message.selectedId;
          collaboration = { ...collaboration, phase: 'connected' };
          const pending = message.requestId ? sharedPending.get(message.requestId) : undefined;
          if (pending) { pending.resolve(reply); sharedPending.delete(message.requestId!); publish(); }
          else publish(reply);
          resolve();
        }).catch(() => connection.close());
      };
      connection.onclose = () => {
        if (socket !== connection || collaboration.phase === 'deleted' || collaboration.phase === 'revoked') return;
        state = undefined;
        collaboration = { ...collaboration, phase: 'reconnecting', canEdit: false, canDownload: false, users: [] }; publish();
        for (const pending of sharedPending.values()) pending.reject(new Error('Connection lost. The edit may have been saved; review the shared file after reconnecting.'));
        sharedPending.clear();
        setTimeout(async () => {
          if (collaboration.phase === 'deleted' || collaboration.phase === 'revoked' || socket !== connection) return;
          try { const response = await fetch(`/api/rockets/${owner}/${slug}`);if (response.status === 404 || response.ok && (await response.json()).rocket.id !== rocketId) { unavailable('revoked');return; } } catch { /* Retry the connection when the network returns. */ }
          connect();
        }, 1000);
      };
      connection.onerror = () => connection.close();
    }
    connect();
  });
}
export function request(action: Action): Promise<Reply> {
  if (collaboration.phase === 'revoked' || collaboration.phase === 'deleted') return Promise.reject(new Error('This rocket is no longer available'));
  if (collaboration.phase !== 'local' && action.type === 'export') return Promise.reject(new Error('Use the shared rocket download endpoint'));
  if (collaboration.phase === 'local' || !sharedActions.has(action.type)) return localRequest(action);
  if (collaboration.phase !== 'connected' || !state || socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Wait for the shared file to reconnect.'));
  if (!collaboration.canEdit) return Promise.reject(new Error('Editor access is required to change this rocket'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    sharedPending.set(requestId, { resolve, reject });
    try { socket!.send(JSON.stringify({ requestId, expectedToken: state!.token, action: action.type === 'import' ? { ...action, bytes: Array.from(action.bytes) } : action })); }
    catch (error) { sharedPending.delete(requestId); reject(error); }
  });
}
