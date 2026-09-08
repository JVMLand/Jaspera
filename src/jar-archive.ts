import { unzip, zip, type Unzipped } from 'fflate';
import { displayMessage as text } from './messages.js';
import type { Compilation } from './protocol';

export function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export interface JarSource {
  original: string;
  source: string;
  className: string;
}
/** Owns archive bytes independently of editor tabs. Only edited classes are rebuilt. */
export class JarArchive {
  readonly sources = new Map<string, JarSource>();
  private pending = new Map<string, Promise<JarSource>>();
  private saved = new Map<string, string>();
  private constructor(
    readonly name: string,
    readonly entries: Unzipped,
    private original: Uint8Array,
  ) {}
  static async open(file: File) {
    if (file.size > 64 * 1024 * 1024) throw Error(text('jar.tooLarge'));
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw Error(text('jar.invalid'));
    let total = 0,
      count = 0,
      invalid = false;
    const entries = await new Promise<Unzipped>((resolve, reject) =>
      unzip(
        bytes,
        {
          filter(entry) {
            total += entry.originalSize;
            invalid ||=
              ++count > 10000 ||
              total > 128 * 1024 * 1024 ||
              entry.name.startsWith('/') ||
              /[\\\x00-\x1f]/.test(entry.name) ||
              entry.name.split('/').some((p) => p === '..' || p === '.');
            return !invalid;
          },
        },
        (error, result) => (error ? reject(Error(text('jar.invalid'))) : resolve(result)),
      ),
    );
    if (invalid) throw Error(text('jar.tooLarge'));
    return new JarArchive(file.name, entries, bytes);
  }
  get paths() {
    return Object.keys(this.entries)
      .filter((p) => !p.endsWith('/'))
      .sort();
  }
  get dirty() {
    return [...this.sources].some(
      ([path, value]) => value.source !== (this.saved.get(path) ?? value.original),
    );
  }
  async source(
    path: string,
    disassemble: (bytes: string) => Promise<{ source: string; className: string }>,
  ) {
    const existing = this.sources.get(path);
    if (existing) return existing;
    const pending = this.pending.get(path);
    if (pending) return pending;
    const work = (async () => {
      const bytes = this.entries[path];
      if (!bytes || bytes.length > 1024 * 1024) throw Error(text('jar.classTooLarge'));
      const result = await disassemble(toBase64(bytes));
      const value = { original: result.source, source: result.source, className: result.className };
      this.sources.set(path, value);
      return value;
    })();
    this.pending.set(path, work);
    try {
      return await work;
    } finally {
      this.pending.delete(path);
    }
  }
  async export(compile: (document: JarSource, source: string) => Promise<Compilation>) {
    const snapshots = [...this.sources].map(([path, document]) => ({
      path,
      document,
      source: document.source,
    }));
    const changed = snapshots.filter((x) => x.source !== x.document.original);
    if (!changed.length)
      return {
        bytes: this.original,
        saved: () => {
          this.saved = new Map(snapshots.map((x) => [x.path, x.source]));
        },
      };
    const entries = Object.assign(Object.create(null), this.entries) as Unzipped;
    for (const { path, document, source } of changed) {
      const result = await compile(document, source);
      if (!result.bytecode || result.diagnostics.some((d) => d.severity === 'error'))
        throw Error(
          path +
            '\n' +
            result.diagnostics
              .filter((d) => d.severity === 'error')
              .map((d) => d.message)
              .join('\n'),
        );
      if (result.className !== document.className || (result.classes?.length ?? 1) > 1)
        throw Error(text('jar.keepClassName', [path]));
      entries[path] = Uint8Array.from(atob(result.bytecode), (c) => c.charCodeAt(0));
    }
    // A changed class invalidates the archive signature. Preserve other manifest attributes.
    for (const path of Object.keys(entries)) {
      if (/^META-INF\/(?:[^/]+\.(?:SF|RSA|DSA|EC)|SIG-[^/]+)$/i.test(path)) delete entries[path];
      if (/^META-INF\/MANIFEST\.MF$/i.test(path)) {
        const lines = new TextDecoder().decode(entries[path]).split(/\r?\n/);
        let digest = false;
        entries[path] = new TextEncoder().encode(
          lines
            .filter((line) => {
              if (!line.startsWith(' ')) digest = /^[^:]*-Digest(?:-[^:]*)?:/i.test(line);
              return !digest;
            })
            .join('\r\n'),
        );
      }
    }
    const bytes = await new Promise<Uint8Array>((resolve, reject) =>
      zip(entries, { level: 6 }, (error, data) => (error ? reject(error) : resolve(data))),
    );
    return {
      bytes,
      saved: () => {
        this.saved = new Map(snapshots.map((x) => [x.path, x.source]));
      },
    };
  }
}

export function jarResource(bytes: Uint8Array) {
  if (bytes.length <= 1024 * 1024 && !bytes.includes(0)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {}
  }
  const head = bytes.subarray(0, 4096);
  return (
    `${bytes.length.toLocaleString()} bytes\n\n` +
    Array.from(
      { length: Math.ceil(head.length / 16) },
      (_, i) =>
        (i * 16).toString(16).padStart(8, '0') +
        '  ' +
        [...head.subarray(i * 16, i * 16 + 16)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' '),
    ).join('\n') +
    (bytes.length > head.length ? '\n⋯' : '')
  );
}
