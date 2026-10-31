import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()], build:{target:'es2020'}})

export default {
  async fetch(request, env, ctx) {
    // 既存の処理
  }
};
