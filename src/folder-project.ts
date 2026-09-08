import { readWorkspaceLayout, type WorkspaceLayout } from './workspace-layout';
import { validateProject, validatePath, type Project } from './project';
export const CONFIG_NAME = 'project.jalprj';
export interface Properties {
  format: 'jalprj';
  version: 1;
  name: string;
  entryFile: string;
  editor?: WorkspaceLayout;
}
export interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
export interface DirectoryHandle {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, FileHandle | DirectoryHandle]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<string>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>;
}
export interface ClassFileEntry {
  path: string;
  handle: FileHandle;
  mtime: number;
  size: number;
}
export interface FolderBinding {
  classFiles?: ClassFileEntry[];
  root: DirectoryHandle;
  configName: string;
  baseline: Map<string, string>;
  properties?: boolean;
  cache?: Map<string, { mtime: number; size: number; text: string }>;
}
const byteLength = (s: string) => new TextEncoder().encode(s).length;
const missing = (e: unknown) => e instanceof Error && e.name === 'NotFoundError';
export function sourcePath(path: string) {
  validatePath(path);
  if (!path.startsWith('src/'))
    throw new Error('ソースは src/ 以下に置いてください（例: src/Main.jal）。');
  return path;
}
export function parseProperties(text: string): Properties {
  if (byteLength(text) > 65536) throw new Error('project.jalprj は 64 KiB 以下にしてください。');
  let p: any;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error('プロジェクト設定の JSON を読み取れませんでした。');
  }
  if (!p || p.format !== 'jalprj' || p.version !== 1)
    throw new Error('対応していないプロジェクト設定です。');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 128)
    throw new Error('プロジェクト名は 1〜128 文字にしてください。');
  const entryFile = p.entryFile ?? 'src/Main.jal';
  if (typeof entryFile !== 'string') throw new Error('実行ファイルが不正です。');
  sourcePath(entryFile);
  if ('files' in p || 'source' in p)
    throw new Error(
      'jalprj にはソースを含められません。src/ 以下に .jal ファイルを置いてください。',
    );
  const editor = readWorkspaceLayout(p.editor);
  return {
    format: 'jalprj',
    version: 1,
    name: p.name.trim(),
    entryFile,
    ...(editor ? { editor } : {}),
  };
}
export function serializeProperties(project: Project) {
  validateProject(project);
  for (const f of project.files) sourcePath(f.path);
  return (
    JSON.stringify(
      parseProperties(
        JSON.stringify({
          format: 'jalprj',
          version: 1,
          name: project.name,
          entryFile: project.workspace.entryFile,
          ...(project.workspace.layout ? { editor: project.workspace.layout } : {}),
        }),
      ),
      null,
      2,
    ) + '\n'
  );
}
async function readText(handle: FileHandle, max = 1024 * 1024) {
  const file = await handle.getFile();
  if (file.size > max) throw new Error(`${handle.name}: ファイルが大きすぎます。`);
  return file.text();
}
async function resolve(root: DirectoryHandle, path: string, create = false) {
  const parts = path.split('/'),
    name = parts.pop()!;
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name };
}
async function readPath(root: DirectoryHandle, path: string): Promise<string | undefined> {
  try {
    const { dir, name } = await resolve(root, path);
    return await readText(await dir.getFileHandle(name));
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
}
export async function openFolder(
  root: DirectoryHandle,
  requireProperties = true,
  previous?: FolderBinding,
): Promise<{ project: Project; binding: FolderBinding }> {
  const configs: FileHandle[] = [];
  for await (const [, h] of root.entries())
    if (h.kind === 'file' && h.name.endsWith('.jalprj')) configs.push(h);
  if (configs.length > 1 || (requireProperties && !configs.length))
    throw new Error(
      configs.length
        ? 'フォルダー直下に複数の .jalprj があります。'
        : 'フォルダー直下の .jalprj が見つかりません。',
    );
  const cache = new Map<string, { mtime: number; size: number; text: string }>();
  async function cached(h: FileHandle, path: string, max = 1024 * 1024) {
    const f = await h.getFile();
    if (f.size > max) throw new Error(`${path}: ファイルが大きすぎます。`);
    const old = previous?.cache?.get(path);
    const text =
      old && old.mtime === f.lastModified && old.size === f.size ? old.text : await f.text();
    cache.set(path, { mtime: f.lastModified, size: f.size, text });
    return text;
  }
  const configName = configs[0]?.name ?? CONFIG_NAME;
  const text = configs.length ? await cached(configs[0], configName, 65536) : undefined;
  const props = text === undefined ? undefined : parseProperties(text),
    files: { path: string; source: string }[] = [];
  const classFiles: ClassFileEntry[] = [];
  const baseline = new Map<string, string>(text === undefined ? [] : [[configName, text]]);
  let entries = 0,
    total = 0;
  async function scan(dir: DirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > 24) throw new Error('ソースのフォルダー階層が深すぎます。');
    for await (const [name, h] of dir.entries()) {
      if (++entries > 2048) throw new Error('src/ 以下の項目数が多すぎます。');
      const path = prefix ? prefix + '/' + name : name;
      if (h.kind === 'directory') await scan(h, path, depth + 1);
      else if (name.toLowerCase().endsWith('.class')) {
        const file = await h.getFile();
        classFiles.push({ path, handle: h, mtime: file.lastModified, size: file.size });
      } else if (name.endsWith('.jal') && (!props || path.startsWith('src/'))) {
        validatePath(path);
        const source = await cached(h, path);
        total += byteLength(source);
        if (files.length >= 64 || total > 6 * 1024 * 1024)
          throw new Error('ソースは 64 ファイル，合計 6 MiB 以下にしてください。');
        files.push({ path, source });
        baseline.set(path, source);
      }
    }
  }
  await scan(root, '', 0);
  classFiles.sort((a, b) => a.path.localeCompare(b.path));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const entry =
    props?.entryFile ??
    files.find((f) => f.path === 'src/Main.jal')?.path ??
    files.find((f) => f.path === 'Main.jal')?.path ??
    files[0]?.path ??
    '';
  if (!previous && props && !files.some((f) => f.path === entry))
    throw new Error('実行対象が見つかりません。');
  const project: Project = {
    name: props?.name ?? root.name,
    files,
    workspace: {
      entryFile: entry,
      activeFile: files.some((f) => f.path === entry) ? entry : (files[0]?.path ?? ''),
      stdin: '',
      wordWrap: props?.editor?.wordWrap ?? false,
      panel: 'console',
      views: props?.editor?.views ?? {},
      layout: props?.editor,
    },
  };
  // Validate source limits and duplicate paths even when the configured entry was removed externally.
  validateProject({
    ...project,
    workspace: { ...project.workspace, entryFile: project.workspace.activeFile },
  });
  return {
    project,
    binding: { root, configName, baseline, properties: !!props, cache, classFiles },
  };
}

export function newBinding(root: DirectoryHandle): FolderBinding {
  return { root, configName: CONFIG_NAME, baseline: new Map(), properties: true };
}
export async function saveFolder(binding: FolderBinding, project: Project): Promise<void> {
  const config = binding.properties === false ? undefined : serializeProperties(project),
    { root, baseline } = binding;
  validateProject(project);
  const desired = new Map(project.files.map((f) => [f.path, f.source]));
  if (config !== undefined) desired.set(binding.configName, config);
  if (root.queryPermission && (await root.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if (
      !root.requestPermission ||
      (await root.requestPermission({ mode: 'readwrite' })) !== 'granted'
    )
      throw new Error('フォルダーへの書き込みが許可されていません。');
  }
  // Check all destinations before writing. Keep per-file baselines after partial saves so retry is safe.
  if (config !== undefined && !baseline.size)
    for await (const [, h] of root.entries())
      if (h.kind === 'file' && h.name.endsWith('.jalprj'))
        throw new Error(
          'このフォルダーには既存のプロジェクトがあります。「フォルダーを開く」で開いてください。',
        );
  const paths = new Set([...baseline.keys(), ...desired.keys()]);
  async function check(path: string) {
    const current = await readPath(root, path);
    if (baseline.has(path) ? current !== baseline.get(path) : current !== undefined)
      throw new Error(
        `${path} は外部で変更されたか，保存先に既に存在します。フォルダーを開き直すか，別のフォルダーへ保存してください。`,
      );
  }
  for (const path of paths) await check(path);
  for (const [path, source] of desired) {
    if (path === binding.configName || baseline.get(path) === source) continue;
    await check(path);
    const { dir, name } = await resolve(root, path, true),
      h = await dir.getFileHandle(name, { create: true });
    if (!baseline.has(path)) baseline.set(path, '');
    const writable = await h.createWritable();
    try {
      await writable.write(source);
      await writable.close();
      baseline.set(path, source);
      binding.cache?.delete(path);
    } catch (e) {
      try {
        await writable.abort();
      } catch {}
      throw e;
    }
  }
  for (const path of [...baseline.keys()])
    if (!desired.has(path)) {
      validatePath(path);
      await check(path);
      const { dir, name } = await resolve(root, path);
      await dir.removeEntry(name);
      baseline.delete(path);
      binding.cache?.delete(path);
    }
  if (config !== undefined && baseline.get(binding.configName) !== config) {
    await check(binding.configName);
    const h = await root.getFileHandle(binding.configName, { create: true });
    if (!baseline.has(binding.configName)) baseline.set(binding.configName, '');
    const w = await h.createWritable();
    try {
      await w.write(config);
      await w.close();
      baseline.set(binding.configName, config);
      binding.cache?.delete(binding.configName);
    } catch (e) {
      try {
        await w.abort();
      } catch {}
      throw e;
    }
  }
}
export async function pickFolder(): Promise<DirectoryHandle> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker)
    throw new Error(
      'このブラウザはフォルダーへの直接保存に対応していません。Chrome / Edge を使用してください。「ZIP にエクスポート」は利用できます。',
    );
  return picker.call(window, { mode: 'readwrite' });
}
export async function projectArchive(project: Project, properties = true): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = Object.create(null);
  validateProject(project);
  if (properties) files[CONFIG_NAME] = strToU8(serializeProperties(project));
  for (const f of project.files) files[f.path] = strToU8(f.source);
  return zipSync(files);
}
