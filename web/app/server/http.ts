import type * as CF from '@cloudflare/workers-types';
export const CFResponse = Response as unknown as typeof CF.Response;
export const json = (data: unknown, status = 200) => CFResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export const fail = (message: string, status: number) => json({ error: message }, status);
export async function readBody(request: CF.Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel();throw new Error('Request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
  return bytes;
}
export async function body(request: CF.Request) {
  const value = JSON.parse(new TextDecoder().decode(await readBody(request, 16384)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
  return value;
}
