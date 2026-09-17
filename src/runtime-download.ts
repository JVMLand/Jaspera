/** Pages serves the JDK as a compressed static asset, not HTTP content encoding. */
export async function fetchRuntimeFile(url: string, init?: RequestInit): Promise<Response> {
  const path = new URL(url).pathname;
  if (!path.endsWith('/jdk27/lib/modules') && !path.endsWith('/jdk27.jar')) return fetch(url, init);
  const compressed = new URL(url);
  compressed.pathname += '.gzip';
  const response = await fetch(compressed, init);
  if (!response.ok || !response.body)
    throw new Error(`Runtime download failed: ${compressed.pathname} (${response.status})`);
  // Decode locally: no Pages Function, Worker route or Content-Encoding override is needed.
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
}
