import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()], build:{target:'es2020'}})

console.log("Supabase環境変数の確認", {
  url: Boolean(env.PUBLIC_SUPABASE_URL),
  key: Boolean(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY)
});
