export const PROTOCOL_VERSION = 1;
export const MODEL_SCHEMA_VERSION = 1;
export const DESKTOP_REVISION = '33bdb6d3062a6d9ef44a00d1ff865f962136e9e9';

export function negotiateProtocol(offered) {
  if (!Array.isArray(offered) || !offered.includes(PROTOCOL_VERSION)) {
    throw new Error('version: protocol 1 required; reconnect with a supported client');
  }
  return PROTOCOL_VERSION;
}

// Fixed field order is part of this encoding. Hash exact archive/options bytes upstream;
// never normalize rocket XML or floating point values here.
const inputFields = [
  'schema', 'desktopRevision', 'engineHash', 'motorCatalogHash', 'materialCatalogHash',
  'archiveTreeHash', 'identitySidecarHash', 'simulationId', 'configurationId',
  'optionsHash', 'extensionSetHash', 'seed', 'integrator',
];

export async function simulationInputHash(input) {
  if (!input || Object.keys(input).length !== inputFields.length ||
      inputFields.some(field => !Object.hasOwn(input, field))) {
    throw new Error('invalid: exact simulation input fields required');
  }
  if (input.schema !== 1 || input.desktopRevision !== DESKTOP_REVISION ||
      !Number.isInteger(input.seed) || input.seed < -2147483648 || input.seed > 2147483647 ||
      !['RK4', 'RK6'].includes(input.integrator)) {
    throw new Error('unsupported: input schema, baseline, seed or integrator');
  }
  for (const field of inputFields.filter(field => field.endsWith('Hash'))) {
    if (!/^[a-f0-9]{64}$/.test(input[field])) throw new Error(`invalid: ${field}`);
  }
  for (const field of ['simulationId', 'configurationId']) {
    if (typeof input[field] !== 'string' || !input[field].length) throw new Error(`invalid: ${field}`);
  }
  const bytes = new TextEncoder().encode(JSON.stringify([
    'openrocket.simulation-input.v1', ...inputFields.map(field => input[field]),
  ]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function resultIsCurrent(result, currentInput) {
  return result.schema === 1 && result.status === 'completed' &&
    result.source === 'browser-client' && result.inputHash === await simulationInputHash(currentInput);
}
