import { Gunzip, Inflate, Zip, ZipDeflate } from 'fflate';
import { SaxesParser } from 'saxes';

export const CODEC_VERSION = 1;
// A single entry may use the archive budget; saved flight XML can exceed 8 MiB.
export const LIMITS = Object.freeze({ upload: 4 * 1024 * 1024, expanded: 16 * 1024 * 1024,
  entry: 16 * 1024 * 1024, entries: 64, depth: 64, elements: 100000, name: 1024 });
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const encode = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class OrkError extends Error {
  constructor(code, message) { super(message); this.name = 'OrkError'; this.code = code; }
}
function fail(code, message) { throw new OrkError(code, message); }
function check(value, code, message) { if (!value) fail(code, message); }
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; ++k) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function safePath(path) {
  check(path && path.length <= LIMITS.name && !/[\\\x00-\x1f]/.test(path) &&
    !path.startsWith('/') && !path.includes(':') &&
    path.split('/').every(p => p && p !== '.' && p !== '..'), 'UNSAFE_PATH', path);
}
// Validate the entire central directory before fflate can allocate decompressed buffers.
// G1 deliberately rejects ZIP64, multidisk, encryption, and directory entries.
function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = p => view.getUint16(p, true), u32 = p => view.getUint32(p, true);
  check(bytes.length >= 22, 'INVALID_ZIP', 'Truncated ZIP');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && u32(end) !== 0x06054b50) --end;
  check(end >= Math.max(0, bytes.length - 65557) && u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length, 'INVALID_ZIP', 'Missing end record');
  const count = u16(end + 10), centralSize = u32(end + 12), central = u32(end + 16);
  check(!u16(end + 4) && !u16(end + 6) && u16(end + 8) === count,
    'UNSUPPORTED_ZIP', 'Multidisk ZIP');
  check(count > 0 && count <= LIMITS.entries && central + centralSize === end,
    'ZIP_LIMIT', 'ZIP64, empty, oversized, or inconsistent directory');
  let p = central, expanded = 0, previousEnd = 0;
  const entries = [], paths = new Set();
  for (let i = 0; i < count; ++i) {
    check(p + 46 <= end && u32(p) === 0x02014b50, 'INVALID_ZIP', 'Central record');
    const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16);
    const compressed = u32(p + 20), size = u32(p + 24), len = u16(p + 28);
    const extra = u16(p + 30), comment = u16(p + 32), local = u32(p + 42);
    check(!(flags & ~0x808) && (method === 0 || method === 8) && !u16(p + 34),
      'UNSUPPORTED_ZIP', 'Encryption, flags, disk, or compression');
    check(p + 46 + len + extra + comment <= end && local + 30 <= central,
      'INVALID_ZIP', 'Entry bounds');
    const nameBytes = bytes.subarray(p + 46, p + 46 + len);
    // UTF-8 and ASCII are sufficient for this corpus; ambiguous legacy encodings reject.
    check((flags & 0x800) || nameBytes.every(b => b < 128), 'UNSUPPORTED_ZIP', 'Legacy filename encoding');
    const path = utf8.decode(nameBytes); safePath(path);
    check(!paths.has(path) && !paths.has(path.toLowerCase()), 'DUPLICATE_PATH', path);
    paths.add(path); paths.add(path.toLowerCase());
    expanded += size;
    check(size <= LIMITS.entry, 'EXPANSION_LIMIT', `Archive entry "${path}" expands to ${size} bytes; the per-entry limit is ${LIMITS.entry / 1048576} MiB (${LIMITS.entry} bytes)`);
    check(expanded <= LIMITS.expanded, 'EXPANSION_LIMIT', `Archive expands to at least ${expanded} bytes; the total expanded limit per upload is ${LIMITS.expanded / 1048576} MiB (${LIMITS.expanded} bytes)`);
    check(compressed !== 0xffffffff, 'EXPANSION_LIMIT', 'ZIP64 compressed sizes are not supported');
    check(u32(local) === 0x04034b50 && u16(local + 6) === flags && u16(local + 8) === method,
      'INVALID_ZIP', 'Local header mismatch');
    const localLen = u16(local + 26), localExtra = u16(local + 28);
    const data = local + 30 + localLen + localExtra;
    check(local >= previousEnd && data + compressed <= central && localLen === len &&
      bytes.subarray(local + 30, local + 30 + len).every((b, n) => b === nameBytes[n]),
      'INVALID_ZIP', 'Local path, overlap, or data bounds');
    if (!(flags & 8)) check(u32(local + 14) === crc && u32(local + 18) === compressed &&
      u32(local + 22) === size, 'INVALID_ZIP', 'Local sizes mismatch');
    previousEnd = data + compressed;
    if (flags & 8) {
      const descriptor = previousEnd + (u32(previousEnd) === 0x08074b50 ? 4 : 0);
      check(descriptor + 12 <= central && u32(descriptor) === crc &&
        u32(descriptor + 4) === compressed && u32(descriptor + 8) === size,
        'INVALID_ZIP', 'Data descriptor mismatch');
      previousEnd = descriptor + 12;
    }
    entries.push({ path, size, crc, method, data, compressed }); p += 46 + len + extra + comment;
  }
  check(p === end && entries[0].path === 'rocket.ork', 'INVALID_ZIP', 'rocket.ork must be first');
  return entries.map(({ path, size, crc, method, data, compressed }) => {
    let unpacked;
    if (method === 0) unpacked = bytes.slice(data, data + compressed);
    else {
      const parts = []; let actual = 0;
      const stream = new Inflate(part => {
        actual += part.length;
        check(actual <= size, 'EXPANSION_LIMIT', 'Declared ZIP size exceeded: ' + path);
        parts.push(part.slice());
      });
      // Each push bounds transient expansion independently of untrusted ZIP sizes.
      for (let p = 0; p < compressed; p += 1024) {
        stream.push(bytes.subarray(data + p, data + Math.min(p + 1024, compressed)), p + 1024 >= compressed);
      }
      unpacked = new Uint8Array(actual); let offset = 0;
      for (const part of parts) { unpacked.set(part, offset); offset += part.length; }
    }
    check(unpacked.length === size && crc32(unpacked) === crc, 'CORRUPT_ZIP', path);
    return { path, bytes: unpacked };
  });
}
function gunzipBounded(bytes) {
  const parts = []; let size = 0;
  const stream = new Gunzip((data) => {
    size += data.length;
    check(size <= LIMITS.entry, 'EXPANSION_LIMIT', 'GZIP expanded limit'); parts.push(data.slice());
  });
  for (let p = 0; p < bytes.length; p += 1024) stream.push(bytes.subarray(p, p + 1024), p + 1024 >= bytes.length);
  const result = new Uint8Array(size); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  // fflate's streaming API does not check GZIP CRC/ISIZE.
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  check(bytes.length >= 18 && v.getUint32(bytes.length - 8, true) === crc32(result) &&
    v.getUint32(bytes.length - 4, true) === size, 'CORRUPT_GZIP', 'CRC/size mismatch');
  return result;
}
function parseXml(xml) {
  check(!/<!DOCTYPE|<!ENTITY/i.test(xml), 'UNSAFE_XML', 'DTD/entities forbidden');
  const parser = new SaxesParser({ xmlns: true });
  const stack = [], nodes = []; let root, elements = 0;
  parser.on('error', error => fail('INVALID_XML', error.message));
  parser.on('xmldecl', decl => check(!decl.encoding || /^utf-8$/i.test(decl.encoding),
    'UNSUPPORTED_XML', 'Only UTF-8 XML is supported'));
  parser.on('opentag', tag => {
    check(++elements <= LIMITS.elements && stack.length < LIMITS.depth, 'XML_LIMIT', 'XML node/depth limit');
    const node = { name: tag.name, attributes: tag.attributes, parent: stack.at(-1), children: [],
      text: '', start: xml.lastIndexOf('<', parser.position - 1), contentStart: parser.position,
      selfClosing: tag.isSelfClosing };
    if (node.parent) node.parent.children.push(node); else root = node;
    nodes.push(node); stack.push(node);
  });
  parser.on('text', text => { if (stack.length) stack.at(-1).text += text; });
  parser.on('cdata', text => { if (stack.length) stack.at(-1).text += text; });
  parser.on('closetag', () => {
    const node = stack.pop(); node.end = parser.position;
    node.contentEnd = node.selfClosing ? node.contentStart : xml.lastIndexOf('</', parser.position - 1);
  });
  parser.write(xml).close();
  check(root?.name === 'openrocket', 'INVALID_XML', 'Expected openrocket root');
  const child = (node, name) => node.children.filter(n => n.name === name);
  const components = nodes.filter(n => n.name === 'rocket' || n.parent?.name === 'subcomponents');
  const diagnostics = [];
  const ids = new Set();
  for (const node of components) {
    const idNodes = child(node, 'id'), names = child(node, 'name');
    node.id = idNodes[0]?.text; node.label = names[0]?.text;
    if (idNodes.length !== 1 || !uuid.test(node.id ?? '')) diagnostics.push('MISSING_OR_INVALID_ID');
    if (ids.has(node.id?.toLowerCase())) diagnostics.push('DUPLICATE_ID');
    ids.add(node.id?.toLowerCase());
    if (names.length !== 1 || names[0].children.length || names[0].selfClosing ||
        /<!--|<\?/.test(xml.slice(names[0].contentStart, names[0].contentEnd))) diagnostics.push('AMBIGUOUS_NAME');
    node.nameNode = names[0];
  }
  const version = root.attributes.version?.value;
  if (version !== '1.11') diagnostics.push('UNSUPPORTED_VERSION');
  const simulations = nodes.filter(n => n.name === 'simulation' && n.parent?.name === 'simulations');
  return { nodes, components, simulations, diagnostics: [...new Set(diagnostics)], version };
}
export async function importArchive(input, sidecar) {
  check(input instanceof Uint8Array && input.length > 0 && input.length <= LIMITS.upload,
    'UPLOAD_LIMIT', 'Expected bounded Uint8Array');
  const original = input.slice(); let entries, source;
  try {
    if (input[0] === 0x50 && input[1] === 0x4b) { entries = zipEntries(input); source = 'zip'; }
    else if (input[0] === 0x1f && input[1] === 0x8b) {
      entries = [{ path: 'rocket.ork', bytes: gunzipBounded(input) }]; source = 'gzip';
    } else { entries = [{ path: 'rocket.ork', bytes: input.slice() }]; source = 'xml'; }
    const xmlBytes = entries[0].bytes;
    check(xmlBytes.length <= LIMITS.entry, 'XML_LIMIT', 'XML size limit');
    const xml = utf8.decode(xmlBytes), parsed = parseXml(xml);
    for (const entry of entries) entry.sha256 = await sha256(entry.bytes);
    const inputHash = await sha256(original);
    const diagnostics = [...parsed.diagnostics];
    // The exact archive hash proves mapping continuity. Recompressed/desktop resaves
    // require explicit reconciliation; names/config IDs do not identify simulations.
    const validSidecar = sidecar && typeof sidecar === 'object' &&
      Object.keys(sidecar).sort().join(',') === 'archiveHash,codecVersion,simulations' && sidecar.codecVersion === CODEC_VERSION && sidecar.archiveHash === inputHash &&
      Array.isArray(sidecar.simulations) && sidecar.simulations.length === parsed.simulations.length &&
      sidecar.simulations.every(s => s && typeof s === 'object' && Object.keys(s).join(',') === 'id' &&
        typeof s.id === 'string' && uuid.test(s.id)) &&
      new Set(sidecar.simulations.map(s => s.id.toLowerCase())).size === parsed.simulations.length;
    if (sidecar && !validSidecar) diagnostics.push('SIDECAR_RECONCILIATION_REQUIRED');
    const identity = validSidecar ? structuredClone(sidecar) : {
      codecVersion: CODEC_VERSION, archiveHash: inputHash,
      simulations: parsed.simulations.map(() => ({ id: crypto.randomUUID() }))
    };
    return { codecVersion: CODEC_VERSION, source, original, entries, xml, parsed,
      changed: false, mode: diagnostics.some(d => d !== 'SIDECAR_RECONCILIATION_REQUIRED') ? 'preservation' : 'editable',
      diagnostics, identity };
  } catch (error) {
    if (error instanceof OrkError) throw error;
    fail('INVALID_ARCHIVE', error.message);
  }
}
export function componentNames(archive) {
  return archive.parsed.components.map(n => ({ id: n.id, type: n.name, name: n.label }));
}
export async function renameComponent(archive, id, expectedName, name) {
  check(archive.mode === 'editable', 'PRESERVATION_ONLY', archive.diagnostics.join(', '));
  check(typeof name === 'string' && name.length <= LIMITS.name && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(name),
    'INVALID_NAME', 'Invalid XML text');
  const target = archive.parsed.components.find(n => n.id === id);
  check(target, 'UNKNOWN_COMPONENT', id);
  check(target.label === expectedName, 'CONFLICT', 'Name precondition failed');
  // A name is a descriptive label, never an identity. Only its exact lexical span changes.
  const escaped = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', '&#13;');
  const { contentStart, contentEnd } = target.nameNode;
  const xml = archive.xml.slice(0, contentStart) + escaped + archive.xml.slice(contentEnd);
  const parsed = parseXml(xml);
  const entries = archive.entries.map(e => e.path === 'rocket.ork'
    ? { path: e.path, bytes: encode.encode(xml) } : { ...e, bytes: e.bytes.slice() });
  for (const entry of entries) entry.sha256 = await sha256(entry.bytes);
  return { ...archive, entries, xml, parsed, identity: structuredClone(archive.identity), changed: true };
}
export async function exportArchive(archive) {
  let bytes = archive.original.slice();
  if (archive.changed) {
    const parts = []; let size = 0;
    const zip = new Zip((error, data) => {
      if (error) throw error;
      parts.push(data); size += data.length;
    });
    // A streaming writer preserves entry order even for numeric filenames.
    for (const entry of archive.entries) {
      const file = new ZipDeflate(entry.path, { level: 6 });
      file.mtime = new Date(1980, 0, 1, 0, 0, 0);
      zip.add(file); file.push(entry.bytes, true);
    }
    zip.end(); bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  }
  const identity = structuredClone(archive.identity); identity.archiveHash = await sha256(bytes);
  return { bytes, identity };
}
