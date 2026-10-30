// 余白。 公開作品のサーバー側 HTML / text / JSON 表示。
// Cloudflare Worker の匿名リクエスト専用。ユーザーCookieやJWTは Supabase に転送しない。
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VISIBLE = new Set(['published', 'open'])
const MAX_DEPTH = 12
const MAX_ITEMS = 240
const MAX_INLINED = 8
const MAX_INLINE_CHARS = 480000
const WORK_FIELDS = 'id,title,pen_name,contributor_credit,section,genre,theme,summary,body,question,inheritance,novelty,status,node_kind,parent_work_id,order_index,created_at,updated_at'
const CHILD_FIELDS = 'id,title,parent_work_id,order_index,node_kind,status,created_at'

export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const safeHttps = text => { try {const url = new URL(text); return url.protocol === 'https:' ? url.href : null} catch {return null} }
export const isUuid = id => UUID.test(id)
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{
  'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
  'access-control-allow-origin':'*', 'x-content-type-options':'nosniff',
}})
const textResponse = (value,status=200) => new Response(value, {status, headers:{
  'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store',
  'access-control-allow-origin':'*','x-content-type-options':'nosniff'
}})

export function runtimeConfig(env) {
  // Cloudflare "Build variables" are not available to the Worker at runtime.
  const url = String(env.PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = String(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY || '').trim()
  const parsed = safeHttps(url)
  if (!parsed || !key || new URL(parsed).pathname !== '/' || !new URL(parsed).hostname.endsWith('.supabase.co')) return null
  return {url,key}
}

async function supabaseGet(env, path, params) {
  const config = runtimeConfig(env)
  if (!config) throw new Error('Public Supabase configuration is missing')
  const url = new URL(`${config.url}/rest/v1/${path}`)
  for (const [name, val] of Object.entries(params)) url.searchParams.set(name, val)
  const headers = {'apikey': config.key, 'accept':'application/json'}
  // Legacy anon keys are JWTs; new sb_publishable keys are NOT JWTs.
  if (/^eyJ[A-Za-z0-9_-]+\./.test(config.key)) headers.authorization = `Bearer ${config.key}`
  const response = await fetch(url, {headers, redirect:'error', signal:AbortSignal.timeout(8000)})
  if (!response.ok) throw new Error(`Public database request failed (${response.status})`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('Unexpected public database response')
  return data
}

async function loadWork(env, id) {
  const list = await supabaseGet(env,'works', {select:WORK_FIELDS,id:`eq.${id}`,status:'in.(published,open)',limit:'1'})
  const work = list[0]
  return work && VISIBLE.has(work.status) ? work : null
}
async function loadReferences(env, id) {
  try {
    const rows = await supabaseGet(env,'work_references', {select:'title,relation,url',work_id:`eq.${id}`,order:'created_at.asc',limit:'20'})
    return rows.map(ref => ({title:String(ref.title||''),relation:String(ref.relation||''),url:safeHttps(ref.url)}))
  } catch { return [] } // Supplemental content must not suppress public body.
}

// Tree traversal uses ONLY anonymous API queries. A hidden parent or child is
// excluded by database RLS; a guessed ID does not confer reading privileges.
export async function loadDescendants(env, rootId, maxItems=MAX_ITEMS) {
  const all = [], seen = new Set([rootId]), depthOf = new Map([[rootId,0]])
  let frontier=[rootId], truncated=false
  for (let level=0; level<MAX_DEPTH && frontier.length; level++) {
    const found=[]
    for (let start=0;start<frontier.length;start+=25) {
      const group=frontier.slice(start,start+25)
      for(let offset=0; ; offset+=200) {
        const rows = await supabaseGet(env,'works', {
          select:CHILD_FIELDS, parent_work_id:`in.(${group.join(',')})`,
          status:'in.(published,open)',order:'order_index.asc,created_at.asc,id.asc',
          limit:'200',offset:String(offset)
        })
        for (const row of rows) {
          if (!isUuid(row.id) || !seen.has(row.parent_work_id) || seen.has(row.id) || !VISIBLE.has(row.status)) continue
          seen.add(row.id)
          depthOf.set(row.id,(depthOf.get(row.parent_work_id)||0)+1)
          found.push(row)
          if (all.length+found.length>=maxItems) {truncated=true;break}
        }
        if (truncated||rows.length<200) break
      }
      if (truncated) break
    }
    all.push(...found)
    frontier=truncated?[]:found.map(row=>row.id)
    if(truncated)break
  }
  if (frontier.length) truncated=true
  const childMap=new Map()
  for(const row of all) {
    if(!childMap.has(row.parent_work_id))childMap.set(row.parent_work_id,[])
    childMap.get(row.parent_work_id).push(row)
  }
  for(const group of childMap.values()) group.sort((a,b)=>(Number(a.order_index)||0)-(Number(b.order_index)||0)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)))
  const ordered=[]
  const walk=(id,level,path)=>{
    for(const row of childMap.get(id)||[]) {
      const nextPath=[...path,row.title]
      ordered.push({...row,depth:level,path:nextPath.join(' › '),url:`/works/${row.id}`})
      walk(row.id,level+1,nextPath)
    }
  }
  walk(rootId,1,[])
  return {items:ordered,truncated}
}

async function loadDescendantBodies(env, nodes) {
  let total=0, selected=[]
  // Groups can also contain their own body. Scan chapters in reading order,
  // skipping empty-body groups without counting them toward the inline limit.
  for(let i=0; i<nodes.length && selected.length<MAX_INLINED; i+=12) {
    const group=nodes.slice(i,i+12)
    const rows=await supabaseGet(env,'works', {
      select:'id,body,status',id:`in.(${group.map(x=>x.id).join(',')})`,
      status:'in.(published,open)', limit:'12'
    })
    const map=new Map(rows.filter(row=>VISIBLE.has(row.status)).map(row=>[row.id,String(row.body||'')]))
    for(const node of group) {
      const body=map.get(node.id)
      if(!body || !body.trim()) continue
      if(total+body.length>MAX_INLINE_CHARS) {
        return {selected,limited:true}
      }
      selected.push({id:node.id,title:node.title,path:node.path,body,url:node.url})
      total+=body.length
      if(selected.length===MAX_INLINED) break
    }
  }
  return {selected,limited:nodes.length>selected.length}
}
const routeLink=(origin,id)=>`${origin}/works/${id}`
const showText = (record) => `【${record.title||'（無題）'}】\n${record.body||''}`
const chaptersText = nodes => nodes.map(n=>`${'  '.repeat(Math.max(0,n.depth-1))}・${n.title}  ${n.url}`).join('\n')

export function renderHtml(work, references, tree, embedded, origin, assetsHtml) {
  const title = `${work.title}｜余白。`
  const canonical=routeLink(origin,work.id)
  const description=String(work.summary||work.body||work.title).replace(/\s+/g,' ').slice(0,160)
  const meta = [
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
  ].join('')
  const owned = references.length ? `<section><h2>参考文献・関連資料</h2><ul>${references.map(r=>`<li>${r.url?`<a href="${escapeHtml(r.url)}" rel="noopener noreferrer">${escapeHtml(r.title)}</a>`:escapeHtml(r.title)}${r.relation?` — ${escapeHtml(r.relation)}`:''}</li>`).join('')}</ul></section>`:''
  const toc = tree.items.length ? `<section><h2>収録作品・目次</h2><ol>${tree.items.map(n=>`<li style="margin-left:${Math.min(n.depth-1,10)*12}px"><a href="${escapeHtml(routeLink(origin,n.id))}">${escapeHtml(n.title)}</a></li>`).join('')}</ol>${tree.truncated?'<p>目次の表示件数を制限しています。章のリンクから続きも閲覧できます。</p>':''}</section>` : ''
  const descendantHtml = embedded.selected.length ? `<section><h2>収録本文（抜粋ではなく、対象章の全文）</h2>${embedded.selected.map(n=>`<section><h3><a href="${escapeHtml(routeLink(origin,n.id))}">${escapeHtml(n.path)}</a></h3><div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(n.body)}</div></section>`).join('')}${embedded.limited?'<p>このページには先頭の一部の章だけを収録しています。残りは上の目次のリンクから各章の全文を取得してください。</p>':''}</section>`:''
  const body = `<main class="public-html-work" style="max-width:850px;margin:2rem auto;padding:1rem;line-height:1.45;font-family:serif;overflow-wrap:anywhere">
     <header><p><a href="/">余白。</a></p><h1>${escapeHtml(work.title)}</h1><p>作者：${escapeHtml(work.pen_name)}${work.contributor_credit?` ／ 入力・構成：${escapeHtml(work.contributor_credit)}`:''}</p><p>${work.status==='open'?'自由公開（未審査）':'審査済み公開'}</p></header>
     ${work.summary?`<p>${escapeHtml(work.summary)}</p>`:''}
     ${work.body?`<article aria-label="本文" style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(work.body)}</article>`:''}
     ${toc}${descendantHtml}${owned}
     <footer><p><a href="${escapeHtml(canonical)}.txt">テキスト形式</a> ／ <a href="${escapeHtml(origin)}/api/public/works/${work.id}">JSON形式</a></p></footer>
   </main>`
  const source=String(assetsHtml)
  if (!source.includes('<div id="root"></div>') || !source.includes('</head>')) throw new Error('Vite index.html template has changed')
  return source.replace(/<meta name="description"[^>]*>/i, '')
    .replace(/<title>[^<]*<\/title>/i,`<title>${escapeHtml(title)}</title>`)
    .replace('</head>',meta+'</head>')
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

// If public-page server configuration is temporarily unavailable, keep direct
// work links usable in a JavaScript-enabled browser. Only HTML may fall back:
// JSON/TXT must continue to report failure rather than returning misleading data.
// This is a reader-availability fallback, not a substitute for SSR configuration.
async function serveBrowserFallback(request, env) {
  try {
    const assetUrl = new URL('/index.html', request.url)
    const response = await env.ASSETS.fetch(new Request(assetUrl, {method:'GET'}))
    if (!response.ok) return textResponse('公開作品を取得できませんでした。しばらくしてから再度お試しください。',503)
    const headers = new Headers(response.headers)
    headers.set('content-type','text/html; charset=utf-8')
    headers.set('cache-control','no-store')
    headers.set('x-content-type-options','nosniff')
    headers.set('x-yohaku-render-mode','spa-fallback')
    headers.delete('content-length')
    headers.delete('etag')
    return new Response(request.method === 'HEAD' ? null : response.body,{status:200,headers})
  } catch {
    return textResponse('公開作品を取得できませんでした。しばらくしてから再度お試しください。',503)
  }
}

// REST and work-page endpoints intentionally use exactly the same authorization
// path: anonymous Supabase SELECT with RLS and explicit public status filters.
export async function servePublicWork(request, env) {
  const url = new URL(request.url)
  const apiMatch=/^\/api\/public\/works\/([^/]+)\/?$/i.exec(url.pathname)
  const txtMatch=/^\/works\/([^/]+)\.txt\/?$/i.exec(url.pathname)
  const htmlMatch=/^\/works\/([^/]+)\/?$/i.exec(url.pathname)
  if(!apiMatch&&!txtMatch&&!htmlMatch) return null
  const id=(apiMatch||txtMatch||htmlMatch)[1]
  const isApi=Boolean(apiMatch),isTxt=Boolean(txtMatch)
  if (request.method==='OPTIONS' && isApi) return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, HEAD, OPTIONS','access-control-allow-headers':'content-type','cache-control':'no-store'}})
  if(request.method!=='GET'&&request.method!=='HEAD') return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD, OPTIONS'}})
  if (!isUuid(id)) return isApi?jsonResponse({error:'not_found'},404):textResponse('作品が見つかりません。',404)
  if(!runtimeConfig(env)) return isApi?jsonResponse({error:'not_configured'},503):isTxt?textResponse('公開作品サービスの接続設定が必要です。',503):serveBrowserFallback(request,env)
  try {
    const work = await loadWork(env,id)
    if (!work) return isApi?jsonResponse({error:'not_found'},404):textResponse('作品が見つかりません。',404)
    const [references,tree]=await Promise.all([loadReferences(env,id),loadDescendants(env,id)])
    const origin=url.origin
    if(isApi) {
      const result={work,references,descendants:tree.items.map(item=>({id:item.id,title:item.title,parent_work_id:item.parent_work_id,depth:item.depth,node_kind:item.node_kind,url:routeLink(origin,item.id)})),truncated:tree.truncated}
      if(url.searchParams.get('include')==='descendants') result.inline_descendant_bodies=(await loadDescendantBodies(env,tree.items)).selected
      return jsonResponse(result)
    }
    const embedded = await loadDescendantBodies(env,tree.items)
    if(isTxt) {
      const txt=[`余白。 — ${work.title}`,`作者：${work.pen_name}`,work.contributor_credit?`入力／構成：${work.contributor_credit}`:'',`公開区分：${work.status==='open'?'自由公開（未審査）':'審査済み公開'}`,`URL：${routeLink(origin,id)}`,'',work.summary||'', '',work.body||'',tree.items.length?'\n【収録作品・目次】\n'+tree.items.map(n=>`${'　'.repeat(n.depth-1)}${n.title} — ${routeLink(origin,n.id)}.txt`).join('\n'):'',embedded.selected.length?'\n【下位作品の本文】\n'+embedded.selected.map(n=>`${n.path}\n${n.body}`).join('\n\n'):'',embedded.limited?'\n※残りの章は目次の個別URLから全文を読めます。':''].filter(Boolean).join('\n')
      return textResponse(txt)
    }
    const assetUrl=new URL('/index.html', url)
    const asset=await env.ASSETS.fetch(new Request(assetUrl,{method:'GET'}))
    if(!asset.ok) throw new Error('Vite index.html asset missing')
    const html=renderHtml(work,references,tree,embedded,origin,await asset.text())
    const headers=new Headers(asset.headers)
    headers.set('content-type','text/html; charset=utf-8')
    headers.set('cache-control','no-store')
    headers.set('x-content-type-options','nosniff')
    headers.delete('content-length')
    headers.delete('etag')
    return new Response(request.method==='HEAD' ? null : html,{status:200,headers})
  } catch(err) {
    // Do not expose Supabase error messages, keys or private structure to clients.
    if(isApi) return jsonResponse({error:'temporarily_unavailable'},503)
    return isTxt ? textResponse('公開作品を取得できませんでした。しばらくしてから再度お試しください。',503) : serveBrowserFallback(request,env)
  }
}
