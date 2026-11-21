import type { ExpandedArchive, XmlNode } from '@openrocket/ork-format';
import { field, numeric } from '../../packages/ork-format/src/radius.js';
import { drawRocket } from '../../engine-adapter/build/generated/teavm/js/reducer.js';
export interface InternalShape {
  id: string; kind: 'tube' | 'shoulder' | 'motor' | 'mass' | 'parachute' | 'streamer' | 'cord';
  x: number; y: number; length: number; radius: number; innerRadius: number;
}
export interface Drawing {
  internals?: InternalShape[];
  polygons: { index: number; points: [number, number][] }[];
  minX: number; maxX: number; radius: number;
  componentIndices: number[]; omitted: string[]; error?: string;
}
export function drawingInput(archive: ExpandedArchive) {
  const nodes = archive.parsed.components;
  const stages = nodes.filter(n => ['stage', 'parallelstage', 'podset'].includes(n.name));
  if (stages.length !== 1 || stages[0].name !== 'stage' || stages[0].parent?.parent?.name !== 'rocket') throw new Error('Drawing supports one direct axial stage; pods and boosters are not projected.');
  const stage = stages[0], root = stage.parent!.parent!;
  for (const component of [root, stage]) for (const n of component.children.filter(n => ['position', 'axialoffset'].includes(n.name))) {
    if (!['absolute', 'after'].includes(n.attributes.method?.value ?? n.attributes.type?.value) || numeric(n.text.trim(), 'assembly position') !== 0) throw new Error('Drawing requires zero assembly offsets.');
  }
  const rows: string[] = [], componentIndices: number[] = [], omitted: string[] = [];
  const read = (n: XmlNode, name: string) => field(archive, n, name).text;
  const scalar = (n: XmlNode, name: string) => numeric(read(n, name), name);
  const optional = (n: XmlNode, name: string, fallback: string) => n.children.some(c => c.name === name) ? read(n, name) : fallback;
  const boolean = (value: string) => { if (!['true', 'false'].includes(value)) throw new Error('Ambiguous geometry flag'); return value; };
  const radius = (n: XmlNode, name: string) => {
    const value = read(n, name), match = /^(auto )?([\s\S]+)$/.exec(value)!;
    return [numeric(match[2], name), !!match[1]];
  };
  const shells = nodes.filter(n => n.parent?.parent === stage);
  if (!shells.length || shells.length > 64) throw new Error('Drawing needs 1–64 supported exterior shells.');
  for (const n of shells) {
    if (!['nosecone', 'transition', 'bodytube'].includes(n.name)) throw new Error(`Exterior ${n.name} cannot be positioned by this drawing; geometry omitted.`);
    if (n.children.some(c => ['position', 'axialoffset'].includes(c.name))) throw new Error('Explicit shell positioning is not yet drawn.');
    const length = scalar(n, 'length'); if (length <= 0) throw new Error('Zero-length shell is not yet drawn.');
    let values: unknown[];
    if (n.name === 'bodytube') values = [n.name, length, ...radius(n, 'radius')];
    else {
      const shape = read(n, 'shape').toUpperCase();
      if (!['CONICAL', 'OGIVE', 'ELLIPSOID', 'POWER', 'PARABOLIC', 'HAACK'].includes(shape)) throw new Error('Unknown shell profile.');
      if (n.name === 'nosecone' && boolean(optional(n, 'isflipped', 'false')) !== 'false') throw new Error('Flipped nose cones are not yet drawn.');
      values = [n.name, length, shape, numeric(optional(n, 'shapeparameter', ['CONICAL', 'ELLIPSOID'].includes(shape) ? '0' : ''), 'shapeparameter'),
        ...(n.name === 'transition' ? radius(n, 'foreradius') : []), ...radius(n, 'aftradius'),
        ...(n.name === 'transition' ? [boolean(optional(n, 'shapeclipped', 'true'))] : [])];
    }
    rows.push(values.join(';')); componentIndices.push(nodes.indexOf(n));
  }
  for (const n of nodes.filter(n => !['rocket', 'stage', 'bodytube', 'nosecone', 'transition'].includes(n.name))) {
    if (n.name !== 'trapezoidfinset' || n.parent?.parent?.name !== 'bodytube') { omitted.push(`${n.label ?? n.name}: ${n.name} (interior or unsupported shape)`); continue; }
    try {
      if (numeric(optional(n, 'cant', '0'), 'fin cant') !== 0) throw new Error('canted fins are not yet drawn');
      const parent = componentIndices.indexOf(nodes.indexOf(n.parent.parent));
      const positions = n.children.filter(c => c.name === 'axialoffset'), legacy = n.children.filter(c => c.name === 'position');
      if (positions.length !== 1 || legacy.length !== 1 || positions[0].attributes.method?.value !== legacy[0].attributes.type?.value || positions[0].text.trim() !== legacy[0].text.trim()) throw new Error('ambiguous fin position');
      const method = positions[0].attributes.method.value.toUpperCase();
      if (!['TOP', 'MIDDLE', 'BOTTOM'].includes(method)) throw new Error('unsupported fin position');
      rows.push([n.name, parent, scalar(n, 'rootchord'), scalar(n, 'tipchord'), scalar(n, 'sweeplength'), scalar(n, 'height'),
        scalar(n, 'fincount'), scalar(n, 'rotation') * Math.PI / 180, method, numeric(positions[0].text.trim(), 'fin offset')].join(';'));
      componentIndices.push(nodes.indexOf(n));
    } catch (error) { omitted.push(`${n.label ?? n.name}: ${String(error)}`); }
  }
  return { input: rows.join('\n'), componentIndices, omitted };
}
export function rocketDrawing(archive: ExpandedArchive): Drawing {
  try { const projection = drawingInput(archive); return { ...JSON.parse(drawRocket(projection.input)), componentIndices: projection.componentIndices, omitted: projection.omitted }; }
  catch (error) { return { polygons: [], minX: 0, maxX: 1, radius: 0, componentIndices: [], omitted: [], error: error instanceof Error ? error.message : String(error) }; }
}
