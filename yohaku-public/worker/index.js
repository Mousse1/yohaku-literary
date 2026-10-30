import { servePublicWork } from './publicPages.js'
export default {
  async fetch(request, env) {
    const response = await servePublicWork(request, env)
    return response || env.ASSETS.fetch(request)
  }
}
