import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3006',
          changeOrigin: true,
          secure: false,
        }
      },
      watch: {
        ignored: ['**/server.ts', '**/.env*']
      },
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
