import { expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { importArchive, exportArchive, renameComponent, componentNames } from '@openrocket/ork-format';

it('imports, edits and exports the loss-aware codec inside workerd', async () => {
  expect(typeof WebSocketPair).toBe('function');
  const id = '0042b74e-f982-49b7-8769-3b38f2278d81';
  const opaque = '<future:setting xmlns:future="urn:g1" value="0.12345678901234567"><!--preserve--></future:setting>';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><openrocket version="1.11"><rocket><name>Original</name><id>${id}</id>${opaque}</rocket><simulations/></openrocket>`;
  const input = gzipSync(new TextEncoder().encode(xml));
  const original = await importArchive(input);
  expect(Array.from((await exportArchive(original)).bytes)).toEqual(Array.from(input));
  const changed = await renameComponent(original, id, 'Original', 'Worker <edit>');
  const exported = await exportArchive(changed);
  const reimported = await importArchive(exported.bytes, exported.identity);
  expect(componentNames(reimported)[0]).toMatchObject({id, name: 'Worker <edit>'});
  expect(reimported.xml).toContain(opaque);
  expect(reimported.entries[0].path).toBe('rocket.ork');
  expect(reimported.identity).toEqual(exported.identity);
  expect(Array.from((await exportArchive(changed)).bytes)).toEqual(Array.from(exported.bytes));
  await expect(importArchive(new TextEncoder().encode('<!DOCTYPE x SYSTEM "file:///etc/passwd"><openrocket/>'))).rejects.toMatchObject({code: 'UNSAFE_XML'});
});
