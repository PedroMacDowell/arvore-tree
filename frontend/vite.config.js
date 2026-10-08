import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // Fontes sempre como arquivos em /assets, nunca embutidas em base64 (data:): a CSP do backend
    // só aceita fontes vindas do próprio site.
    assetsInlineLimit: file => (file.endsWith('.woff2') ? false : undefined),
  },
  // Em desenvolvimento o Vite repassa /api ao backend: frontend e API ficam na mesma origem,
  // como em produção (onde o backend serve o build), e o cookie de sessão funciona sem CORS.
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
})
