import {defineConfig,loadEnv} from 'vite'
import react from '@vitejs/plugin-react'
import {searchVerificationPlugin} from './scripts/searchVerification.js'

export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_')
 return {plugins:[react(),searchVerificationPlugin(process.env.VITE_GOOGLE_SITE_VERIFICATION||env.VITE_GOOGLE_SITE_VERIFICATION)]}
})
