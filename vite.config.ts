import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/adapter/content-script.ts',
      name: 'SafePaste',
      formats: ['iife'],
      fileName: () => 'content-script.js',
    },
  },
});
