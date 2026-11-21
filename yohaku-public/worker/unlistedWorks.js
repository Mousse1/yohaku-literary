import {isUuid,runtimeConfig} from './publicWorksApi.js'
import {publicReference} from './publicAnnotations.js'
import {renderExportHtml,renderExportMarkdown,renderExportText} from './workExports.js'

const headers={
  'cache-control':'no-store',
  'x-robots-tag':'noindex, nofollow, noarchive',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}
export async function serveUnlisted(request,env) {
  const url=new URL(request.url)
  if(!url.pathname.startsWith('/share/'))return null
  const respond=(body,status=200,type='text/plain',extra={})=>new Response(request.method==='HEAD'?null:body,{status,headers:{...headers,'content-type':type+'; charset=utf-8',...extra}})
  const match=/^\/share\/([0-9a-f-]{36})(?:\.(md|txt)|\/(print))?\/?$/i.exec(url.pathname)
  if(!match||!isUuid(match[1]))return respond('作品が見つかりません。',404)
  if(!['GET','HEAD'].includes(request.method))return respond('対応していない操作です。',405,'text/plain',{allow:'GET, HEAD'})
  const config=runtimeConfig(env)
  if(!config)return respond('接続設定を確認してください。',503)
  try {
    const dbHeaders={apikey:config.key,'content-type':'application/json'}
    if(config.key.startsWith('eyJ'))dbHeaders.authorization='Bearer '+config.key
    const response=await fetch(config.url+'/rest/v1/rpc/read_unlisted_work',{
      method:'POST',headers:dbHeaders,body:JSON.stringify({p_token:match[1]}),
      redirect:'manual',signal:AbortSignal.timeout(8000),
    })
    if(!response.ok)return respond('共有内容を取得できませんでした。',503)
    const doc=await response.json()
    if(!doc)return respond('作品が見つからないか、共有が終了しています。',404)
    if(!doc.root||!Array.isArray(doc.records)||doc.records.length>240)return respond('共有内容を取得できませんでした。',503)
    for(const record of doc.records)record.references=(record.references||[]).map(publicReference)
    const base=url.origin+'/share/'+match[1]
    const format=match[2]
    let body=format==='md'?renderExportMarkdown(doc,url.origin):format==='txt'?renderExportText(doc,url.origin):renderExportHtml(doc,url.origin)
    // Keep all included chapters and note links inside this capability URL.
    for(const record of doc.records){
      const id=record.work.id
      body=body.replaceAll(url.origin+'/works/'+id+'#note-',base+'#'+id+'-note-')
        .replaceAll(url.origin+'/works/'+id,base+'#work-'+id)
    }
    if(format==='md')body=body.replace(/^JSON:.*$/m,'')
    if(!format){
      const links='<a href="'+base+'">限定公開ページ</a> ／ <a href="'+base+'.md">Markdownを保存</a> ／ <a href="'+base+'.txt">テキストを保存</a>'
      body=body.replace('<div class="controls">','<div class="controls">'+links)
        .replace('<meta name="viewport"', '<meta name="referrer" content="no-referrer"><meta name="viewport"')
    }
    return respond(body,200,format==='md'?'text/markdown':format==='txt'?'text/plain':'text/html',
      format?{'content-disposition':'attachment; filename="yohaku.'+format+'"'}:{})
  }catch{return respond('共有内容を取得できませんでした。時間をおいて再度お試しください。',503)}
}
