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
export function request(action: Action): Promise<Reply> {
  if (fatal) return Promise.reject(new Error('Document worker unavailable. Reload and reopen your local file.'));
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action });
  });
}
