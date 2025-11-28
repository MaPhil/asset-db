import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, 'frontend');

export default defineConfig({
  root: projectRoot,
  base: '/dist/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'public/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(projectRoot, 'index.html')
    }
  },
  server: {
    fs: {
      allow: [__dirname]
    }
  }
});
