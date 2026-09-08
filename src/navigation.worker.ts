import { expose, transfer } from 'comlink';
import { unzipSync } from 'fflate';
import { analyzeSymbols } from './symbols.js';
let archive: Promise<Uint8Array> | undefined;
const api = {
  analyze(source: string) {
    return analyzeSymbols(source);
  },
  async classBytes(owner: string): Promise<Uint8Array | null> {
    if (!/^[\w$]+(?:\/[\w$]+)*$/.test(owner)) throw new Error('Invalid class name');
    archive ??= fetch(new URL('../runtime/jdk23.jar', self.location.href))
      .then(async (r) => {
        if (!r.ok) throw new Error('OpenJDK を読み込めませんでした。');
        return new Uint8Array(await r.arrayBuffer());
      })
      .catch((e) => {
        archive = undefined;
        throw e;
      });
    const name = owner + '.class',
      files = unzipSync(await archive, {
        filter: (e) => e.name === name && e.originalSize <= 1024 * 1024,
      });
    const bytes = files[name];
    return bytes ? transfer(bytes, [bytes.buffer]) : null;
  },
};
export type NavigationApi = typeof api;
expose(api);
