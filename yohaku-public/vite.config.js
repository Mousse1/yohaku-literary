import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


export default {
  
const pathname = new URL(request.url).pathname;

if (pathname.startsWith("/export/")) {
  console.log("ファイル共有のSupabase接続確認", {
    url: Boolean(env.PUBLIC_SUPABASE_URL),
    key: Boolean(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    anonKey: Boolean(env.PUBLIC_SUPABASE_ANON_KEY),
    viteUrl: Boolean(env.VITE_SUPABASE_URL)
  });
}

  async fetch(request, env, ctx) {
    // 既存の処理
  }
};
