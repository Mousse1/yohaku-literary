import {anonymousSelect,isUuid,runtimeConfig} from './publicWorksApi.js'

const PAGE_SIZE=1000
const MAX_WORK_MAPS=49999
const filter='in.(published,open)'
const escapeXml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
const xml=(body,method)=>new Response(method==='HEAD'?null:'<?xml version="1.0" encoding="UTF-8"?>\n'+body,{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})
const error=(message,status,method)=>new Response(method==='HEAD'?null:message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(status===503?{'retry-after':'60'}:{}),...(status===405?{allow:'GET, HEAD'}:{})}})
const urlset=entries=>'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.join('')+'</urlset>'
const lastmod=row=>{
  // Group HTML aggregates descendants; its own updated_at alone is not a
  // reliable modification time for the assembled page. Omit rather than invent.
  if(row.node_kind==='collection')return ''
  const date=new Date(row.updated_at||row.created_at||'')
  return Number.isFinite(date.getTime())?'<lastmod>'+date.toISOString()+'</lastmod>':''
}

export async function serveSitemaps(request,env) {
  const url=new URL(request.url),path=url.pathname
  const part=/^\/sitemaps\/works-([1-9][0-9]{0,4})\.xml$/.exec(path)
  const known=path==='/sitemap.xml'||path==='/sitemaps/pages.xml'||part
  if(!known){if(path.startsWith('/sitemaps/'))return error('Sitemap not found',404,request.method);return null}
  if(!['GET','HEAD'].includes(request.method))return error('Method not allowed',405,request.method)
  if(path==='/sitemaps/pages.xml')return xml(urlset([`<url><loc>${escapeXml(url.origin)}/</loc></url>`]),request.method)
  if(!runtimeConfig(env))return error('サイトマップの接続設定を確認してください。',503,request.method)
  try{
    if(path==='/sitemap.xml'){
      const {total}=await anonymousSelect(env,'works',{select:'id',status:filter,limit:1},{count:true,head:true})
      const pages=Math.ceil(total/PAGE_SIZE)
      if(pages>MAX_WORK_MAPS)throw Error('sitemap_index_limit')
      const locations=[`${url.origin}/sitemaps/pages.xml`,...Array.from({length:pages},(_,i)=>`${url.origin}/sitemaps/works-${i+1}.xml`)]
      return xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+locations.map(loc=>`<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('')+'</sitemapindex>',request.method)
    }
    const page=Number(part[1])
    if(page>MAX_WORK_MAPS)return error('Sitemap not found',404,request.method)
    const offset=(page-1)*PAGE_SIZE
    const {rows,total}=await anonymousSelect(env,'works',{select:'id,status,node_kind,created_at,updated_at',status:filter,order:'id.asc',offset,limit:PAGE_SIZE},{count:true})
    const expected=Math.min(PAGE_SIZE,Math.max(0,total-offset))
    if(rows.length!==expected)throw Error('incomplete_sitemap_page')
    const seen=new Set()
    // Status is checked again even though the database uses an anonymous RLS
    // query. Never expose draft/private identifiers from an unexpected response.
    const entries=rows.filter(row=>row&&isUuid(row.id)&&['published','open'].includes(row.status)).filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true})
      .map(row=>`<url><loc>${escapeXml(url.origin)}/works/${row.id}</loc>${lastmod(row)}</url>`)
    return xml(urlset(entries),request.method)
  }catch(err){
    console.error('[Sitemap]',err?.message||'unavailable')
    return error('サイトマップを取得できませんでした。時間をおいて再度お試しください。',503,request.method)
  }
}
