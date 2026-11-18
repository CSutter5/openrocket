import type { ExpandedArchive as ArchiveContract, IdentitySidecar } from '@openrocket/contracts';
export const CODEC_VERSION: 1;
export const LIMITS: Readonly<{ upload: number; expanded: number; entry: number; entries: number; depth: number; elements: number; name: number }>;
export class OrkError extends Error { code: string; constructor(code: string, message: string); }
export interface XmlNode {
  name: string;
  attributes: Record<string, { value: string }>;
  parent?: XmlNode;
  children: XmlNode[];
  text: string;
  start: number; contentStart: number; contentEnd: number; end: number;
  selfClosing: boolean;
  id?: string; label?: string; nameNode?: XmlNode;
}
export interface ExpandedArchive extends ArchiveContract {
  source: 'zip' | 'gzip' | 'xml';
  changed: boolean;
  entries: { path: string; bytes: Uint8Array; sha256: string }[];
  parsed: { nodes: XmlNode[]; components: XmlNode[]; simulations: XmlNode[]; diagnostics: string[]; version?: string };
}
export function sha256(bytes: Uint8Array): Promise<string>;
export function importArchive(input: Uint8Array, sidecar?: IdentitySidecar): Promise<ExpandedArchive>;
export function componentNames(archive: ExpandedArchive): { id?: string; type: string; name?: string }[];
export function renameComponent(archive: ExpandedArchive, id: string, expectedName: string, name: string): Promise<ExpandedArchive>;
export function exportArchive(archive: ExpandedArchive): Promise<{ bytes: Uint8Array; identity: IdentitySidecar }>;
