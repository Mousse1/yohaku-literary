import {robotsText} from './crawlerPolicy.js'
import {servePublicWorksApi} from './publicWorksApi.js'
import {servePublicWorkHtml} from './publicWorkHtml.js'
import {serveWorkExport} from './workExports.js'

export default {
  async fetch(request, env) {
    if(new URL(request.url).pathname==='/robots.txt')return new Response(request.method==='HEAD'?null:request.method==='GET'?robotsText:'Method not allowed',{status:['GET','HEAD'].includes(request.method)?200:405,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store',allow:'GET, HEAD'}})
    // /api/public/works はJSONのみ、/works/:id は初期HTMLに公開本文を含める。
    // 公開データ経路は失敗時もHTTPステータスを明示し、空のSPAへ戻さない。
    return (await serveWorkExport(request, env)) ||
      (await servePublicWorksApi(request, env)) ||
      (await servePublicWorkHtml(request, env)) ||
      env.ASSETS.fetch(request)
  }
}
