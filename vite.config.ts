import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
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
