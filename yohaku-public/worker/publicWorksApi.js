// 余白。v7.4 — 公開作品をJSONとして返す読み取り専用API。
// Supabaseへは公開(anon / publishable)キーだけを渡す。
// 訪問者のCookie/Authorizationヘッダーは決して転送しない。
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_STATUSES = new Set(['published', 'open'])
const FILTER = 'in.(published,open)'
const MAX_DEPTH = 12
const MAX_TREE_ITEMS = 240
const LIST_FIELDS = 'id,title,pen_name,contributor_credit,section,genre,theme,summary,status,node_kind,parent_work_id,order_index,created_at,updated_at'
const FULL_FIELDS = `${LIST_FIELDS},body,question,inheritance,novelty`
const CHILD_FIELDS = 'id,title,parent_work_id,order_index,node_kind,status,created_at'
const MAX_LIST = 50
const MAX_DESCENDANTS_PAGE = 12

export const isUuid = value => UUID.test(String(value ?? ''))
const canonical = (origin, id) => `${origin}/works/${id}`
const endpoint = (origin, id) => `${origin}/api/public/works/${id}`
const jsonResponse = (value, status = 200, method = 'GET', extraHeaders = {}) => new Response(
  method === 'HEAD' ? null : JSON.stringify(value),
  {status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  }}
)

export function runtimeConfig(env = {}) {
  // Dashboard の Worker 実行時変数。既存 VITE_* が実行時にも登録されている場合は再利用可能。
  const url = String(env.PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
  const key = String(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || parsed.pathname !== '/' || parsed.search || parsed.hash || !key) return null
    return {url, key}
  } catch { return null }
}

async function anonymousSelect(env, table, params) {
  const config = runtimeConfig(env)
  if (!config) throw new Error('missing_runtime_config')
  const url = new URL(`${config.url}/rest/v1/${table}`)
  for (const [name,value] of Object.entries(params)) url.searchParams.set(name, String(value))
  const headers = {apikey:config.key, accept:'application/json'}
  // 旧 anon JWT は Bearer 認証も使用。新 publishable key は JWT ではない。
  if (/^eyJ[A-Za-z0-9_-]+\./.test(config.key)) headers.authorization = `Bearer ${config.key}`
  const response = await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)})
  if (!response.ok) throw new Error('public_database_unavailable')
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('invalid_database_response')
  return data
}

function publicItem(row, origin) {
  // PostgRESTへ送るselectは公開項目に限定。ユーザーIDや審査情報は含めない。
  return {...row, url:canonical(origin,row.id), api_url:endpoint(origin,row.id)}
}
const validRow = row => row && isUuid(row.id) && PUBLIC_STATUSES.has(row.status)
async function getWork(env,id) {
  const result = await anonymousSelect(env,'works',{select:FULL_FIELDS,id:`eq.${id}`,status:FILTER,limit:1})
  return result.find(validRow) || null
}
async function getReferences(env,id) {
  // 参考文献は補足情報。RLSまたはクエリ失敗でも本文は取得できるようにする。
  try {
    const rows = await anonymousSelect(env,'work_references',{
      select:'title,relation,url',work_id:`eq.${id}`,order:'created_at.asc',limit:20
    })
    return rows.map(row=>({title:String(row.title||''),relation:String(row.relation||''),url:safeReferenceUrl(row.url)}))
  } catch { return [] }
}
function safeReferenceUrl(value) {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}
function readPage(url, max=MAX_LIST) {
  const rawPage = url.searchParams.get('page') ?? '1'
  const rawLimit = url.searchParams.get('limit') ?? '20'
  if (!/^[1-9]\d{0,4}$/.test(rawPage) || !/^[1-9]\d{0,2}$/.test(rawLimit)) return null
  const page=Number(rawPage), limit=Number(rawLimit)
  if (page>200 || limit>max) return null
  return {page,limit,offset:(page-1)*limit}
}
function listSearchParams(url) {
  const q = (url.searchParams.get('q') || '').trim()
  // PostgREST expression delimitersを含む検索は受け取らない（SQL/フィルター構文として解釈させない）。
  if (q && (q.length>80 || /[,%*().\\\r\n\t]/.test(q))) return null
  const section = (url.searchParams.get('section') || '').trim()
  if (section && (!['文学','哲学','評論','科学','その他'].includes(section))) return null
  const rootOnly = url.searchParams.get('root_only')
  if (rootOnly !== null && !['0','1'].includes(rootOnly)) return null
  return {q,section,rootOnly:rootOnly==='1'}
}
async function listWorks(env, url) {
  const pagination=readPage(url)
  const filter=listSearchParams(url)
  if (!pagination || !filter) return {error:'invalid_query',status:400}
  const {page,limit,offset}=pagination
  const params={select:LIST_FIELDS,status:FILTER,order:'created_at.desc,id.desc',limit:limit+1,offset}
  if(filter.q) params.title=`ilike.*${filter.q}*`
  if(filter.section) params.section=`eq.${filter.section}`
  if(filter.rootOnly) params.parent_work_id='is.null'
  const rows=(await anonymousSelect(env,'works',params)).filter(validRow)
  const items=rows.slice(0,limit).map(row=>publicItem(row,url.origin))
  const hasMore=rows.length>limit
  return {data:{items,pagination:{page,limit,has_more:hasMore,next_page:hasMore?page+1:null},links:{self:url.href}},status:200}
}

// 常に匿名RLS+公開statusを通して親から子へ辿り、非公開の枝を通らない。
export async function loadPublicTree(env,rootId,maxItems=MAX_TREE_ITEMS) {
  const all=[];const seen=new Set([rootId]);let frontier=[rootId],truncated=false
  for(let depth=0;depth<MAX_DEPTH && frontier.length;depth++) {
    const next=[]
    for(let start=0;start<frontier.length && !truncated;start+=20) {
      const batch=frontier.slice(start,start+20)
      for(let offset=0;;offset+=200) {
        const rows=await anonymousSelect(env,'works',{
          select:CHILD_FIELDS,parent_work_id:`in.(${batch.join(',')})`,status:FILTER,
          order:'order_index.asc,created_at.asc,id.asc',limit:200,offset
        })
        for(const row of rows) {
          if (!validRow(row) || seen.has(row.id) || !seen.has(row.parent_work_id)) continue
          seen.add(row.id); next.push(row); all.push(row)
          if(all.length>=maxItems){truncated=true;break}
        }
        if(truncated || rows.length<200) break
      }
    }
    frontier=truncated?[]:next.map(row=>row.id)
  }
  if(frontier.length) truncated=true
  const children=new Map()
  for(const row of all){
    if(!children.has(row.parent_work_id)) children.set(row.parent_work_id,[])
    children.get(row.parent_work_id).push(row)
  }
  for(const group of children.values()) group.sort((a,b)=>
    (Number(a.order_index)||0)-(Number(b.order_index)||0)||
    String(a.created_at||'').localeCompare(String(b.created_at||''))||
    String(a.id).localeCompare(String(b.id))
  )
  const ordered=[]
  const visit=(parentId, depth, parts)=>{
    for(const child of children.get(parentId)||[]){
      const path=[...parts,child.title]
      ordered.push({...child,depth,path:path.join(' › ')})
      visit(child.id,depth+1,path)
    }
  }
  visit(rootId,1,[])
  return {items:ordered,truncated}
}

async function getDescendantPage(env,url,id,root) {
  const pagination=readPage(url,MAX_DESCENDANTS_PAGE)
  if(!pagination) return {error:'invalid_query',status:400}
  const tree=await loadPublicTree(env,id)
  const {page,limit,offset}=pagination
  const selected=tree.items.slice(offset,offset+limit)
  let bodyMap=new Map()
  if(selected.length) {
    const rows=await anonymousSelect(env,'works',{
      select:FULL_FIELDS,id:`in.(${selected.map(row=>row.id).join(',')})`,status:FILTER,limit:selected.length
    })
    bodyMap=new Map(rows.filter(validRow).map(row=>[row.id,row]))
  }
  const items=selected.filter(row=>bodyMap.has(row.id)).map(row=>({
    ...publicItem(bodyMap.get(row.id),url.origin),depth:row.depth,path:row.path
  }))
  const hasMore=offset+limit<tree.items.length
  return {data:{root:{id:root.id,title:root.title,url:canonical(url.origin,root.id)},items,
    pagination:{page,limit,has_more:hasMore,next_page:hasMore?page+1:null},
    tree_truncated:tree.truncated,links:{self:url.href,root:endpoint(url.origin,id)}},status:200}
}


// ツリー上限を超える大規模な作品でも、各グループ直下の作品はページ単位で取得できる。
async function getChildrenPage(env,url,id,root) {
  const pagination=readPage(url,MAX_LIST)
  if(!pagination) return {error:'invalid_query',status:400}
  const {page,limit,offset}=pagination
  const rows=await anonymousSelect(env,'works',{
    select:CHILD_FIELDS,parent_work_id:`eq.${id}`,status:FILTER,
    order:'order_index.asc,created_at.asc,id.asc',limit:limit+1,offset
  })
  const hasMore=rows.length>limit
  return {data:{root:{id:root.id,title:root.title,url:canonical(url.origin,root.id)},
    items:rows.slice(0,limit).filter(validRow).map(row=>publicItem(row,url.origin)),
    pagination:{page,limit,has_more:hasMore,next_page:hasMore?page+1:null}},status:200}
}

async function detailWork(env,url,id) {
  const work=await getWork(env,id)
  if(!work) return {error:'not_found',status:404}
  const [references,tree]=await Promise.all([getReferences(env,id),loadPublicTree(env,id)])
  const data={work:publicItem(work,url.origin),references,
    descendants:tree.items.map(row=>({...row,url:canonical(url.origin,row.id),api_url:endpoint(url.origin,row.id)})),
    truncated:tree.truncated,
    links:{self:endpoint(url.origin,id),html:canonical(url.origin,id),descendants:`${endpoint(url.origin,id)}/descendants`,children:`${endpoint(url.origin,id)}/children`}}
  // v7.3の利用者向け互換性。大量の本文は専用ページングAPIを利用する。
  if(url.searchParams.get('include')==='descendants') {
    const selected=tree.items.slice(0,8)
    const rows=selected.length?await anonymousSelect(env,'works',{
      select:'id,title,body,status',id:`in.(${selected.map(row=>row.id).join(',')})`,status:FILTER,limit:8
    }):[]
    const bodies=new Map(rows.filter(validRow).map(row=>[row.id,row]))
    data.inline_descendant_bodies=selected.filter(row=>bodies.has(row.id)&&bodies.get(row.id).body).map(row=>({
      id:row.id,title:row.title,path:row.path,body:bodies.get(row.id).body,url:canonical(url.origin,row.id)
    }))
    data.inline_truncated=tree.items.length>8
  }
  return {data,status:200}
}

// JSONルート以外には介入しない。共有URL /works/:id は従来のSPAに委ねる。
export async function servePublicWorksApi(request, env) {
  const url=new URL(request.url)
  if(!url.pathname.startsWith('/api/public/')) return null
  if(request.method==='OPTIONS') return jsonResponse(null,204,'HEAD')
  if(request.method!=='GET' && request.method!=='HEAD') return jsonResponse({error:'method_not_allowed'},405,request.method,{allow:'GET, HEAD, OPTIONS'})
  const path=url.pathname.replace(/\/$/,'')
  const list=path==='/api/public/works'
  const match=/^\/api\/public\/works\/([^/]+?)(\/(?:descendants|children))?$/.exec(path)
  if(!list&&!match) return jsonResponse({error:'not_found'},404,request.method)
  const id=match?.[1]
  if(id&&!isUuid(id)) return jsonResponse({error:'not_found'},404,request.method)
  if(!runtimeConfig(env)) return jsonResponse({error:'not_configured'},503,request.method)
  try {
    let result
    if(list) result=await listWorks(env,url)
    else if(match[2]) {
      const root=await getWork(env,id)
      if (!root) result={error:'not_found',status:404}
      else if (match[2]==='/children') result=await getChildrenPage(env,url,id,root)
      else result=await getDescendantPage(env,url,id,root)
    } else result=await detailWork(env,url,id)
    return jsonResponse(result.data||{error:result.error},result.status,request.method)
  } catch {
    // 接続情報、内部SQL、認証エラー詳細は外部に開示しない。
    return jsonResponse({error:'temporarily_unavailable'},503,request.method)
  }
}
