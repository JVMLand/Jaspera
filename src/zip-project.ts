import { JarArchive } from './jar-archive';
import { parseProperties } from './folder-project';
import { validateProject, type Project } from './project';
import { msg } from './messages.js';

/** Import sources into an unbound project; saving must choose a real folder. */
export async function openZipProject(
  file: File,
): Promise<{ project: Project; properties: boolean } | undefined> {
  const archive = await JarArchive.open(file);
  let paths = archive.paths.map((path) => ({ path, original: path }));
  // Distributors commonly wrap the whole project in one directory.
  while (paths.length && paths.every(({ path }) => path.includes('/'))) {
    const prefix = paths[0].path.split('/')[0] + '/';
    if (prefix === 'src/' || !paths.every(({ path }) => path.startsWith(prefix))) break;
    paths = paths.map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
  }
  const configs = paths.filter(({ path }) => !path.includes('/') && path.endsWith('.jalprj'));
  if (configs.length > 1) throw new Error(msg('m95f7084c4d84'));
  const decode = (path: string) =>
    new TextDecoder('utf-8', { fatal: true }).decode(archive.entries[path]);
  const properties = configs[0] ? parseProperties(decode(configs[0].original)) : undefined;
  const sources = paths.filter(
    ({ path }) => path.endsWith('.jal') && (!properties || path.startsWith('src/')),
  );
  if (sources.length > 64) throw new Error(msg('m20a0d8b5aeff'));
  let total = 0;
  for (const { original } of sources) {
    const size = archive.entries[original].length;
    total += size;
    if (size > 1024 * 1024 || total > 6 * 1024 * 1024) throw new Error(msg('m8cea98e986be'));
  }
  const files = sources
    .map(({ path, original }) => ({
      path,
      source: decode(original),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  // Resource-only ZIPs retain the existing archive viewer.
  if (!files.length && !properties) return undefined;
  const entryFile =
    properties?.entryFile ??
    files.find((f) => f.path === 'src/Main.jal')?.path ??
    files.find((f) => f.path === 'Main.jal')?.path ??
    files[0]?.path ??
    '';
  if (!files.some((f) => f.path === entryFile)) throw new Error(msg('md7afc4fabe9c'));
  return {
    properties: !!properties,
    project: validateProject({
      name: properties?.name ?? file.name.replace(/\.zip$/i, '').slice(0, 128),
      files,
      workspace: {
        entryFile,
        activeFile: entryFile,
        stdin: '',
        panel: 'project',
        wordWrap: properties?.editor?.wordWrap ?? false,
        views: properties?.editor?.views ?? {},
        layout: properties?.editor,
      },
    }),
  };
}
