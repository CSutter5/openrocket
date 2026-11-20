import type { ExpandedArchive, XmlNode } from '@openrocket/ork-format';
import { numeric } from '../../../packages/ork-format/src/radius.js';
import type { Integrator } from './provenance';
export interface StoredPlot { name: string; points: [number, number][] }
export interface SavedSimulation {
  id: string; name: string; status: string; configurationId?: string;
  summary: (number | null)[]; plots: StoredPlot[];
  support?: import('./input').Support;
  options?: Record<string, string>; integrator?: Integrator; reason?: string;
}
const child = (node: XmlNode, name: string) => {
  const matches = node.children.filter(n => n.name === name);
  if (matches.length !== 1) throw new Error(`Expected one saved ${name}`);
  return matches[0];
};
function options(simulation: XmlNode) {
  const conditions = child(simulation, 'conditions'), result: Record<string, string> = {};
  if (Object.keys(conditions.attributes).length || conditions.text.trim()) throw new Error('Unsupported saved conditions attributes or text');
  const allowed = 'configid launchrodlength launchintowind launchrodangle launchroddirection windaverage windturbulence winddirection wind windmodeltype launchaltitude launchlatitude launchlongitude geodeticmethod simulationsteppermethod randomseed atmosphere gravity timestep maxtime recoveryspeedwarning drogueLowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning'.split(' ');
  for (const n of conditions.children) {
    if (!allowed.includes(n.name)) throw new Error(`Saved setting ${n.name} is not supported`);
    if (!['wind', 'atmosphere', 'gravity'].includes(n.name) && (n.children.length || Object.keys(n.attributes).length)) throw new Error(`Ambiguous saved ${n.name}`);
    if (n.name !== 'wind' && conditions.children.filter(c => c.name === n.name).length !== 1) throw new Error(`Ambiguous saved ${n.name}`);
  }
  const value = (name: string, fallback?: string) => {
    const n = conditions.children.find(n => n.name === name);
    if (!n && fallback !== undefined) return fallback;
    return child(conditions, name).text.trim();
  };
  const number = (name: string, min: number, max: number, fallback?: string) => {
    const text = value(name, fallback), n = numeric(text, `saved ${name}`);
    if (n < min || n > max) throw new Error(`Saved ${name} must be between ${min} and ${max}`);
    result[name] = text;
  };
  const token = (name: string, values: string[], fallback?: string) => {
    const text = value(name, fallback);
    if (!values.includes(text)) throw new Error(`Saved ${name}=${text} is not supported`);
    result[name] = text;
  };
  number('launchrodlength', .001, 100); number('launchrodangle', -60, 60); number('launchroddirection', -360, 360);
  token('launchintowind', ['true', 'false'], 'false');
  number('launchaltitude', -1000, 100000); number('launchlatitude', -90, 90); number('launchlongitude', -180, 180);
  token('geodeticmethod', ['flat', 'spherical', 'wgs84']);
  token('simulationsteppermethod', ['rk4', 'rk6'], 'rk4');
  number('randomseed', -2147483648, 2147483647, '42');
  if (!Number.isInteger(Number(result.randomseed))) throw new Error('Saved random seed must be an integer');
  number('timestep', .001, 1); number('maxtime', .001, 3600);
  token('windmodeltype', ['Average', 'average'], 'Average');
  const winds = conditions.children.filter(n => n.name === 'wind' && n.attributes.model?.value === 'average');
  if (winds.length > 1) throw new Error('Ambiguous saved average wind');
  if (conditions.children.filter(n => n.name === 'wind').some(n => !['average', 'multilevel'].includes(n.attributes.model?.value))) throw new Error('Unknown saved wind model');
  for (const [name, legacy] of [['speed', 'windaverage'], ['direction', 'winddirection'], ['standarddeviation', 'windturbulence']]) {
    let text = winds.length ? child(winds[0], name).text.trim() : value(legacy);
    if (!winds.length && name === 'standarddeviation') text = String(Number(text) * Number(value('windaverage')));
    const n = numeric(text, 'saved wind ' + name);
    if (n < 0 || n > (name === 'direction' ? 2 * Math.PI : 100)) throw new Error(`Saved wind ${name} outside supported bounds`);
    result['wind/' + name] = text;
  }
  for (const parent of [winds[0]].filter(Boolean)) for (const n of parent.children) if (n.children.length || Object.keys(n.attributes).length) throw new Error('Unsupported saved wind value');
  if (winds.length && (Object.keys(winds[0].attributes).join(',') !== 'model' || winds[0].children.some(n => !['speed', 'direction', 'standarddeviation'].includes(n.name)))) throw new Error('Unsupported saved wind fields');
  const atmosphere = child(conditions, 'atmosphere'), gravity = conditions.children.find(n => n.name === 'gravity');
  for (const parent of [atmosphere, gravity].filter((n): n is XmlNode => !!n)) for (const n of parent.children) if (n.children.length || Object.keys(n.attributes).length) throw new Error('Unsupported saved atmosphere or gravity value');
  result.atmosphere = atmosphere.attributes.model?.value;
  if (!['isa', 'extendedisa'].includes(result.atmosphere) || Object.keys(atmosphere.attributes).join(',') !== 'model') throw new Error('Unsupported saved atmosphere');
  if (result.atmosphere === 'isa' && atmosphere.children.length) throw new Error('Unsupported ISA atmosphere fields');
  if (result.atmosphere === 'extendedisa') {
    for (const [name, min, max] of [['basetemperature', 100, 1000], ['basepressure', 1, 1e7], ['baserelativehumidity', 0, 1]] as const) {
      const text = child(atmosphere, name).text.trim(), n = numeric(text, 'saved ' + name);
      if (n < min || n > max) throw new Error(`Saved ${name} outside supported bounds`);
      result[name] = text;
    }
    if (atmosphere.children.length !== 3) throw new Error('Unsupported saved atmosphere fields');
  }
  result.gravity = gravity?.attributes.model?.value ?? 'wgs';
  if (result.gravity !== 'wgs' || gravity && Object.keys(gravity.attributes).join(',') !== 'model') throw new Error('Unsupported saved gravity');
  if (gravity?.children.length) throw new Error('Unsupported WGS gravity fields');
  for (const name of ['recoveryspeedwarning', 'drogueLowspeedwarning', 'recoverydroguemainhighspeedwarning', 'recoverydroguemainlowspeedwarning']) if (conditions.children.some(n => n.name === name)) number(name, 0, 10000);
  return result;
}
export function savedSimulations(archive: ExpandedArchive): SavedSimulation[] {
  return archive.parsed.simulations.map((n, i) => {
    const data = n.children.find(n => n.name === 'flightdata');
    const scalar = (name: string) => {
      const text = data?.attributes[name]?.value;
      if (text === undefined || !text.trim()) return null;
      try { return numeric(text, 'stored summary'); } catch { return null; }
    };
    const row: SavedSimulation = { id: archive.identity.simulations[i].id, name: n.children.find(n => n.name === 'name')?.text ?? '(unnamed)', status: n.attributes.status?.value ?? 'unspecified',
      summary: ['maxaltitude', 'maxvelocity', 'timetoapogee', 'flighttime'].map(scalar), plots: [] };
    for (const branch of data?.children.filter(n => n.name === 'databranch') ?? []) {
      const types = branch.attributes.types?.value.split(',').map(s => s.trim().toLowerCase()) ?? [], time = types.indexOf('time'), altitude = types.indexOf('altitude');
      if (time < 0 || altitude < 0 || types.filter(t => t === 'time').length !== 1 || types.filter(t => t === 'altitude').length !== 1) continue;
      const points: [number, number][] = [];
      for (const point of branch.children.filter(n => n.name === 'datapoint')) {
        const columns = point.text.split(','), t = Number(columns[time]), h = Number(columns[altitude]);
        if (columns[time]?.trim() && columns[altitude]?.trim() && Number.isFinite(t) && Number.isFinite(h)) points.push([t, h]);
      }
      if (points.length) row.plots.push({ name: branch.attributes.name?.value ?? 'Flight', points });
    }
    try {
      const conditions = child(n, 'conditions');
      row.configurationId = child(conditions, 'configid').text.trim();
      row.options = options(n); row.integrator = row.options.simulationsteppermethod.toUpperCase() as Integrator;
    } catch (error) { row.reason = error instanceof Error ? error.message : String(error); }
    return row;
  });
}
export function savedSimulation(archive: ExpandedArchive, id: string) {
  const row = savedSimulations(archive).find(n => n.id === id);
  if (!row) throw new Error('Unknown saved simulation');
  if (row.reason || !row.options || !row.configurationId) throw new Error(row.reason ?? 'Saved simulation has no motor configuration');
  return row;
}
