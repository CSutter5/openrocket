import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync, zipSync } from 'fflate';
import { componentNames, exportArchive, importArchive, renameComponent, LIMITS } from '../src/index.js';
const examples = new URL('../../../../core/src/main/resources/datafiles/examples/', import.meta.url);
const encode = new TextEncoder();
const id = '11111111-2222-3333-4444-555555555555';
const minimal = `<openrocket version="1.11"><rocket><name>A</name><id>${id}</id></rocket><simulations><simulation><name>same</name></simulation><simulation><name>same</name></simulation></simulations></openrocket>`;
const xml = text => encode.encode(text);
const zip = entries => zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) });

for (const filename of await readdir(examples)) {
  if (!filename.endsWith('.ork')) continue;
  test(`corpus lexical/asset preservation: ${filename}`, async () => {
    const bytes = new Uint8Array(await readFile(new URL(filename, examples)));
    if (filename === 'Parallel booster staging.ork') {
      await assert.rejects(importArchive(bytes), { code: 'UNSAFE_PATH' });
      return;
    }
    const archive = await importArchive(bytes);
    assert.equal(archive.mode, 'editable', archive.diagnostics.join(', '));
    assert.equal(archive.parsed.version, '1.11');
    assert.deepEqual((await exportArchive(archive)).bytes, bytes);
    const target = componentNames(archive).find(c => c.type === 'bodytube');
    assert.ok(target);
    const changed = await renameComponent(archive, target.id, target.name, 'Web & desktop <proof>');
    const first = await exportArchive(changed), second = await exportArchive(changed);
    assert.deepEqual(first.bytes, second.bytes);
    const reopened = await importArchive(first.bytes, first.identity);
    assert.equal(reopened.entries[0].path, 'rocket.ork');
    assert.deepEqual(reopened.identity, first.identity);
    assert.equal(componentNames(reopened).find(c => c.id === target.id).name, 'Web & desktop <proof>');
    assert.deepEqual(componentNames(reopened).map(c => c.id), componentNames(archive).map(c => c.id));
    assert.deepEqual(reopened.entries.slice(1).map(e => [e.path, e.sha256]), archive.entries.slice(1).map(e => [e.path, e.sha256]));
    assert.equal(reopened.parsed.simulations.length, archive.parsed.simulations.length);
    const n = archive.parsed.components.find(c => c.id === target.id).nameNode;
    assert.equal(changed.xml, archive.xml.slice(0, n.contentStart) + 'Web &amp; desktop &lt;proof&gt;' + archive.xml.slice(n.contentEnd));
    assert.ok(!reopened.entries.some(e => /sidecar|web-metadata/.test(e.path)));
  });
}
test('plain XML/GZIP retain original and changed ZIP supports Unicode/XML escaping', async () => {
  for (const bytes of [xml(minimal), gzipSync(xml(minimal))]) {
    const imported = await importArchive(bytes);
    assert.deepEqual((await exportArchive(imported)).bytes, bytes);
    const changed = await exportArchive(await renameComponent(imported, id, 'A', '🚀 É & <x>'));
    assert.equal((await importArchive(changed.bytes)).parsed.components[0].label, '🚀 É & <x>');
  }
});
test('opaque XML/comments/namespaces and entries survive rename', async () => {
  const input = minimal.replace('<name>A</name>', '<name>A</name><!-- keep --><future xmlns:x="urn:future" f="1.2300"><x:value>opaque &amp; text</x:value></future>');
  const original = zip({ 'rocket.ork': xml(input), 'opaque/data.bin': new Uint8Array([0, 255, 8]) });
  const changed = await renameComponent(await importArchive(original), id, 'A', 'B');
  const reopened = await importArchive((await exportArchive(changed)).bytes);
  assert.equal(reopened.xml, input.replace('<name>A</name>', '<name>B</name>'));
  assert.deepEqual(reopened.entries[1].bytes, new Uint8Array([0, 255, 8]));
});
test('duplicate/missing component IDs and future formats preserve but refuse edits', async () => {
  for (const input of [minimal.replace('<id>'+id+'</id>', ''), minimal.replace('1.11', '1.12'),
    minimal.replace('</rocket>', `<subcomponents><stage><name>B</name><id>${id}</id></stage></subcomponents></rocket>`)]) {
    const archive = await importArchive(xml(input));
    assert.equal(archive.mode, 'preservation');
    assert.deepEqual((await exportArchive(archive)).bytes, xml(input));
    await assert.rejects(renameComponent(archive, id, 'A', 'B'), { code: 'PRESERVATION_ONLY' });
  }
});
test('conflicts and external exact-archive-bound simulation identities', async () => {
  const archive = await importArchive(xml(minimal));
  assert.notEqual(archive.identity.simulations[0].id, archive.identity.simulations[1].id);
  await assert.rejects(renameComponent(archive, id, 'stale', 'B'), { code: 'CONFLICT' });
  const exported = await exportArchive(archive);
  assert.deepEqual((await importArchive(exported.bytes, exported.identity)).identity, exported.identity);
  const changed = await exportArchive(await renameComponent(archive, id, 'A', 'B'));
  const uncertain = await importArchive(changed.bytes, exported.identity);
  assert.ok(uncertain.diagnostics.includes('SIDECAR_RECONCILIATION_REQUIRED'));
  assert.notDeepEqual(uncertain.identity.simulations, exported.identity.simulations);
});
test('XML entities/malformed/depth and upload limits reject', async () => {
  for (const input of ['<!DOCTYPE openrocket [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+minimal,
    '<openrocket><rocket></openrocket>', minimal.replace('<name>A</name>', '<name>&undefined;</name>'),
    '<openrocket>'+ '<x>'.repeat(LIMITS.depth) + '</x>'.repeat(LIMITS.depth)+'</openrocket>']) {
    await assert.rejects(importArchive(xml(input)));
  }
  await assert.rejects(importArchive(new Uint8Array(LIMITS.upload+1)), { code: 'UPLOAD_LIMIT' });
});
test('unsafe/duplicate ZIP paths, expansion/count limits, first entry, truncation and CRC reject', async () => {
  for (const path of ['../escape', '/absolute', 'a/../escape', 'a\\b', 'a//b', 'C:/x']) {
    await assert.rejects(importArchive(zip({ 'rocket.ork': xml(minimal), [path]: new Uint8Array([1]) })), { code: 'UNSAFE_PATH' });
  }
  await assert.rejects(importArchive(zip({ 'rocket.ork': xml(minimal), 'A.bin': new Uint8Array(), 'a.bin': new Uint8Array() })), { code: 'DUPLICATE_PATH' });
  await assert.rejects(importArchive(zip({ 'rocket.ork': xml(minimal), 'bomb': new Uint8Array(LIMITS.entry+1) })), { code: 'EXPANSION_LIMIT' });
  await assert.rejects(importArchive(zip(Object.fromEntries([['rocket.ork', xml(minimal)], ...Array.from({length:LIMITS.entries}, (_,i)=>['f'+i,new Uint8Array()])]))), { code: 'ZIP_LIMIT' });
  await assert.rejects(importArchive(zip({ 'first.bin': new Uint8Array(), 'rocket.ork': xml(minimal) })), { code: 'INVALID_ZIP' });
  const valid = zip({ 'rocket.ork': xml(minimal) });
  await assert.rejects(importArchive(valid.subarray(0, valid.length - 3)));
  const corrupt = zipSync({ 'rocket.ork': xml(minimal) }, { level: 0 }); corrupt[40] ^= 1;
  await assert.rejects(importArchive(corrupt), { code: 'CORRUPT_ZIP' });
  const gzip = gzipSync(xml(minimal)); gzip[gzip.length - 8] ^= 1;
  await assert.rejects(importArchive(gzip), { code: 'CORRUPT_GZIP' });
});

test('lying ZIP expanded size rejects during streaming inflation', async () => {
  const bomb = zip({ 'rocket.ork': xml(minimal), 'bomb': new Uint8Array(LIMITS.entry) });
  const v = new DataView(bomb.buffer); let central = v.getUint32(bomb.length - 6, true);
  central += 46 + v.getUint16(central + 28, true) + v.getUint16(central + 30, true) + v.getUint16(central + 32, true);
  const local = v.getUint32(central + 42, true);
  v.setUint32(central + 24, 1, true); v.setUint32(local + 22, 1, true);
  await assert.rejects(importArchive(bomb), { code: 'EXPANSION_LIMIT' });
});

test('malformed identity sidecars require explicit reconciliation', async () => {
  const imported = await importArchive(xml(minimal));
  for (const simulations of [[{id: undefined}, {id: 'x'}], [{id: 'x'}, {id: 'y'}], [null,null]]) {
    const sidecar = {...imported.identity, simulations};
    assert.ok((await importArchive(xml(minimal),sidecar)).diagnostics.includes('SIDECAR_RECONCILIATION_REQUIRED'));
  }
  assert.ok((await importArchive(xml(minimal),{...imported.identity, extra:true})).diagnostics.includes('SIDECAR_RECONCILIATION_REQUIRED'));
});
test('numeric opaque filenames cannot precede rocket.ork during export', async () => {
  const archive = await importArchive(xml(minimal));
  archive.entries.push({path: '123', bytes: new Uint8Array([42])});
  const changed = await renameComponent(archive,id,'A','B');
  const reopened = await importArchive((await exportArchive(changed)).bytes);
  assert.deepEqual(reopened.entries.map(e=>e.path),['rocket.ork','123']);
});

test('ZIP descriptor metadata must agree with central directory and desktop stream reader', async () => {
  const changed = await renameComponent(await importArchive(xml(minimal)),id,'A','B');
  const exported = await exportArchive(changed);
  const bytes = exported.bytes.slice(); const view = new DataView(bytes.buffer);
  const central = view.getUint32(bytes.length - 6,true), compressed = view.getUint32(central + 20,true);
  const descriptor = 30 + view.getUint16(26,true) + view.getUint16(28,true) + compressed;
  assert.equal(view.getUint32(descriptor,true),0x08074b50);
  bytes[descriptor + 4] ^= 1;
  await assert.rejects(importArchive(bytes),{code:'INVALID_ZIP'});
});

test('UTF-8 BOM and CRLF outside the edited lexical span survive', async () => {
  const input = '\ufeff' + minimal.replaceAll('><','>\r\n<');
  const changed = await renameComponent(await importArchive(xml(input)),id,'A','B');
  const reopened = await importArchive((await exportArchive(changed)).bytes);
  assert.equal(reopened.xml,input.replace('<name>A</name>','<name>B</name>'));
  assert.deepEqual(reopened.entries[0].bytes,xml(input.replace('<name>A</name>','<name>B</name>')));
});

test('opaque comments and processing instructions within a name cannot be discarded by editing', async () => {
  for (const name of ['A<!--opaque-->', 'A<?future opaque?>']) {
    const input = xml(minimal.replace('<name>A</name>', `<name>${name}</name>`));
    const archive = await importArchive(input);
    assert.equal(archive.mode, 'preservation');
    assert.deepEqual((await exportArchive(archive)).bytes, input);
    await assert.rejects(renameComponent(archive, id, 'A', 'B'), {code: 'PRESERVATION_ONLY'});
  }
});
