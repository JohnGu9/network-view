import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/rest': {
        target: 'wss://localhost:7200',
        ws: true,
        secure: false,
        changeOrigin: true,
      }
    },
  },
  plugins: [react(), basicSsl(),],
})
