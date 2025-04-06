import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        'media-sync': resolve(__dirname, 'src/index.ts'),
        'media-sync-element': resolve(__dirname, 'src/register.ts')
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});