import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'demo' ? './' : '/',
  define: { 'import.meta.env.VITE_SIMULATION_MODE': JSON.stringify(mode === 'demo' ? 'browser' : 'server') },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { outDir: mode === 'demo' ? '../../dist/demo' : '../../dist/public', emptyOutDir: true },
}));
