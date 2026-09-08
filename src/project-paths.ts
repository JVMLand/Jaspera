import { msg } from './messages.js';
import { validatePath } from './project';
export function planPathChange(
  paths: readonly string[],
  old: string,
  destination: string,
  folder: boolean,
) {
  if (folder && (destination === old || destination.startsWith(old + '/')))
    throw new Error(msg('m11f99df1a8e3'));
  const affected = paths.filter((path) => (folder ? path.startsWith(old + '/') : path === old));
  if (!affected.length) throw new Error(msg('mcf0a5713e9f5'));
  const changes = new Map(
    affected.map((path) => [path, folder ? destination + path.slice(old.length) : destination]),
  );
  const occupied = paths.map((path) => changes.get(path) ?? path);
  for (const path of changes.values()) validatePath(path);
  const lower = occupied.map((path) => path.toLowerCase());
  if (
    new Set(lower).size !== lower.length ||
    lower.some((path) => lower.some((other) => other !== path && other.startsWith(path + '/')))
  )
    throw new Error(msg('m017cff0dcc3b'));
  if (
    folder &&
    paths.some(
      (path) =>
        !changes.has(path) && path.toLowerCase().startsWith(destination.toLowerCase() + '/'),
    )
  )
    throw new Error(msg('md5f1080cc54a'));
  return changes;
}
