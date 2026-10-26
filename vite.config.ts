import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { localPmtilesPlugin } from './scripts/dev/pmtilesPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), localPmtilesPlugin()],
  server: { host: 'localhost', port: 5173, strictPort: true,
    // Archives and isolated QA browser profiles are not application source.
    watch: { ignored: ['**/data/raw/**', '**/data/processed/**', '**/.tools/**'] },
  },
})
