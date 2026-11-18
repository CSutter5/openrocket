import application from './index';
import type { RadiusBindings } from './radius-room';

// Separate entry point/configuration: the baseline transport proof does not
// acquire a generated-engine build prerequisite or domain endpoints.
export default {
  fetch(request: Request, env: RadiusBindings, ctx: ExecutionContext) {
    const match = /^\/radius\/([a-z0-9-]{1,64})\/(import|state|commands|export)$/.exec(new URL(request.url).pathname);
    return match ? env.RADIUS_ROOMS.getByName(match[1]).fetch(request) : application.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<RadiusBindings>;
export { ProofRoom } from './index';
export { RadiusRoom } from './radius-room';
