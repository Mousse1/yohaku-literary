import {build} from 'esbuild'
await build({entryPoints:['src/printRenderer.js'],bundle:true,platform:'browser',format:'iife',minify:true,outfile:'public/print-renderer.js',define:{'process.env.NODE_ENV':'"production"'}})

await build({entryPoints:['src/shareReader.js'],bundle:true,platform:'browser',format:'iife',minify:true,outfile:'public/share-reader.js',define:{'process.env.NODE_ENV':'\"production\"'}})
