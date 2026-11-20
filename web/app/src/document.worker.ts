import { createDocumentSession } from './document-session';
import { describe } from './document-view';
import type { Action } from './model';
const session = createDocumentSession(describe);
// Serialize asynchronous codec operations; never publish an intermediate candidate.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; action: Action }>) => {
  queue = queue.then(async () => {
    try { self.postMessage({ id: data.id, result: await session.execute(data.action) }); }
    catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
