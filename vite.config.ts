import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { version } from './package.json';
// Keep package.json valid semver while displaying the calendar release number.
const appVersion = version.replace(/\.0$/, '');
let buildCommit = 'unknown';
try {
  buildCommit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  /* Source archives may not contain Git metadata. */
}

export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_COMMIT__: JSON.stringify(buildCommit),
  },
  server: { watch: { ignored: ['**/.cache/**'] } },
  optimizeDeps: {
    entries: ['index.html', 'detached.html', 'tests/harness.html'],
    include: ['elkjs/lib/elk-api.js', 'antlr4', 'comlink'],
    // Optimizing individual Monaco contributions can register the same action twice.
    // Production still bundles Monaco into the shared chunk below.
    exclude: ['monaco-editor'],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.replaceAll('\\', '/').includes('/node_modules/monaco-editor/')) return 'monaco';
        },
      },
      input: { main: 'index.html', detached: 'detached.html' },
    },
  },
});
