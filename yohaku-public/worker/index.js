import { servePublicWorksApi } from './publicWorksApi.js'

export default {
  async fetch(request, env) {
    const api = await servePublicWorksApi(request, env)
    return api || env.ASSETS.fetch(request)
  }
}
