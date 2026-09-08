import manifest from '../.cache/cloudflare/manifest.json';
import { createHandler } from './handler.mjs';
export default { fetch: createHandler(manifest) };
