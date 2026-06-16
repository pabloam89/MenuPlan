import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
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
              proxyReq.setHeader('anthropic-version', '2023-06-01');
              proxyReq.setHeader('anthropic-beta', 'pdfs-2024-09-25');
              const apiKey = env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || '';
              if (apiKey) proxyReq.setHeader('x-api-key', apiKey);
            });
            proxy.on('error', (err) => console.error('Proxy error:', err.message));
          },
        },
      },
    },
  }
})
