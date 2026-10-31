import {servePublicWorksApi} from './publicWorksApi.js'
import {servePublicWorkHtml} from './publicWorkHtml.js'
import {serveWorkExport} from './workExports.js'

export default {
  async fetch(request, env) {
    // /api/public/works はJSONのみ、/works/:id は初期HTMLに公開本文を含める。
    // 非公開/接続失敗時は従来のReact SPAの共有URLを維持する。
    return (await serveWorkExport(request, env)) ||
      (await servePublicWorksApi(request, env)) ||
      (await servePublicWorkHtml(request, env)) ||
      env.ASSETS.fetch(request)
  }
}
