import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['8062-178-136-108-149.ngrok-free.app', 'web', 'gateway', '.ngrok-free.app'],
    proxy: {
      '/match': 'http://gateway:3000',
      '/ws': {
        target: 'ws://gateway:3000',
        ws: true,
      },
      '/graphql': 'http://gateway:3000',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['8062-178-136-108-149.ngrok-free.app', 'web', 'gateway', '.ngrok-free.app'],
    proxy: {
      '/match': 'http://gateway:3000',
      '/ws': {
        target: 'ws://gateway:3000',
        ws: true,
      },
      '/graphql': 'http://gateway:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
