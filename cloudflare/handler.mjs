/** Select an encoding, respecting explicit exclusions and quality values. */
export function selectEncoding(header) {
  const weights = new Map();
  for (const part of (header ?? '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params.find((p) => p.trim().startsWith('q='));
    const value = q ? Number(q.trim().slice(2)) : 1;
    weights.set(name, Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0);
  }
  const weight = (name) => weights.get(name) ?? weights.get('*') ?? 0;
  const br = weight('br'),
    gzip = weight('gzip');
  // Identity is a fallback unless explicitly preferred or both compressed formats are refused.
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1);
  if (weights.has('identity') && identity > Math.max(br, gzip)) return 'identity';
  if (br > 0 && br >= gzip) return 'br';
  if (gzip > 0) return 'gzip';
  return identity > 0 ? 'identity' : null;
}

export function createHandler(manifest, originFetch = fetch) {
  return async (request, env) => {
    const url = new URL(request.url);
    // Routes are restricted as well; preserve the existing origin if called outside the app.
    if (url.pathname !== '/jaspera' && !url.pathname.startsWith('/jaspera/'))
      return originFetch(request);
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/jaspera') {
      url.pathname += '/';
      return Response.redirect(url.href, 308);
    }
    const path = url.pathname === '/jaspera/' ? '/jaspera/index.html' : url.pathname;
    const entry = Object.hasOwn(manifest, path) ? manifest[path] : undefined;
    if (!entry) return new Response('Not found', { status: 404 });
    const encoding = entry.encodings
      ? selectEncoding(request.cf?.clientAcceptEncoding ?? request.headers.get('Accept-Encoding'))
      : 'identity';
    if (!encoding)
      return new Response('No acceptable encoding', {
        status: 406,
        headers: { Vary: 'Accept-Encoding' },
      });
    const headers = new Headers({
      'Content-Type': entry.type,
      'Cache-Control': path.startsWith('/jaspera/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
      ETag: `W/"${entry.hash}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    if (entry.encodings) headers.set('Vary', 'Accept-Encoding');
    if (encoding !== 'identity') headers.set('Content-Encoding', encoding === 'br' ? 'br' : 'gzip');
    if (path === '/jaspera/sw.js') headers.set('Service-Worker-Allowed', '/jaspera/');
    const matches = request.headers
      .get('If-None-Match')
      ?.split(',')
      .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === `"${entry.hash}"`);
    if (matches) return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers, encodeBody: 'manual' });
    const asset = entry.encodings
      ? entry.encodings[encoding === 'identity' ? 'gzip' : encoding]
      : entry.path;
    const assetUrl = new URL('/' + asset, url);
    // Do not forward conditional/range headers for the compressed storage representation.
    const response = await env.ASSETS.fetch(
      new Request(assetUrl, { headers: { 'Accept-Encoding': 'identity' } }),
    );
    if (!response.ok || !response.body) return new Response('Asset unavailable', { status: 502 });
    const body =
      entry.encodings && encoding === 'identity'
        ? response.body.pipeThrough(new DecompressionStream('gzip'))
        : response.body;
    return new Response(body, { headers, encodeBody: 'manual' });
  };
}
