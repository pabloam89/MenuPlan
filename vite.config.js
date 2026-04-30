import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/generate': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        secure: false,
        rewrite: () => '/v1/messages',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('anthropic-dangerous-direct-browser-access', 'true');
            const apiKey = process.env.VITE_ANTHROPIC_API_KEY || '';
            if (apiKey) proxyReq.setHeader('x-api-key', apiKey);
          });
          proxy.on('error', (err) => console.error('Proxy error:', err.message));
        },
      },
    },
  },
})
