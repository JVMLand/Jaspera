import { defineConfig } from 'vite';
export default defineConfig({ base: './', optimizeDeps: { include: ['elkjs/lib/elk-api.js'] }, worker: { format: 'es' }, build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', detached: 'detached.html' } } } });
