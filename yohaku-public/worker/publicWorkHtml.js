// 公開作品URLを、本文を含む初期HTMLとして返す。
// v7.4 JSON API と別経路。DB接続が失敗しても /works/:id は従来のReact SPAに戻す。
import {isUuid, runtimeConfig, getWork, getReferences, loadPublicTree, getVisibleBodies} from './publicWorksApi.js'
import {renderAnnotatedPlainText} from '../src/annotationMarkers.js'

const MAX_INLINE_WORKS = 12
const MAX_INLINE_CHARS = 320000
const MAX_SCAN = 96
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const publicLink = (origin,id) => `${origin}/works/${id}`

// テキストはエスケープしてからpre-wrap表示。Markdown原文・改行・段落冒頭の字下げを保護する。
function textBlock(text, className='initial-work-body') {
  if (!text) return ''
  return `<div class="${className}" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45">${renderAnnotatedPlainText(text, escapeHtml)}</div>`
}

export function renderPublicWorkHtml(template, work, references, tree, embedded, origin) {
  // build後の index.html（CSS/JSアセット参照）をそのまま使う。
  // この関数は初期表示のHTMLだけを作り、クライアントの読書画面を置き換えない。
  const root=/<div\s+id=["']root["']\s*>\s*<\/div>/i
  if (!root.test(template) || !/<\/head\s*>/i.test(template)) return null
  const title=`${work.title||'作品'}｜余白。`
  const canonical=publicLink(origin,work.id)
  const description=String(work.summary||work.body||work.title||'').replace(/\s+/g,' ').slice(0,160)
  const meta=`<link rel="alternate" type="application/json" title="作品本文JSON" href="${escapeHtml(origin)}/api/public/works/${escapeHtml(work.id)}/content">`+
    `<meta name="description" content="${escapeHtml(description)}">`+
    `<link rel="canonical" href="${escapeHtml(canonical)}">`+
    `<meta property="og:type" content="article">`+
    `<meta property="og:title" content="${escapeHtml(title)}">`+
    `<meta property="og:description" content="${escapeHtml(description)}">`+
    `<meta property="og:url" content="${escapeHtml(canonical)}">`

  const info=[work.question&&['この作品が問うこと',work.question],work.inheritance&&['先行作品から継承するもの',work.inheritance],work.novelty&&['新たに試みること',work.novelty]]
    .filter(Boolean).map(([label,content])=>`<section><h2>${escapeHtml(label)}</h2>${textBlock(content,'initial-work-position')}</section>`).join('')
  const refs=references.length ? `<section><h2>参考文献・関連資料</h2><ul>${references.map(r=>`<li>${r.url?`<a href="${escapeHtml(r.url)}" rel="noopener noreferrer">${escapeHtml(r.title)}</a>`:escapeHtml(r.title)}${r.relation?' — '+escapeHtml(r.relation):''}</li>`).join('')}</ul></section>` : ''
  const toc=tree.items.length ? `<nav aria-label="収録作品の目次"><h2>目次・収録作品</h2><ol>${tree.items.map(n=>`<li style="margin-left:${Math.min(n.depth,10)*12}px"><a href="${escapeHtml(publicLink(origin,n.id))}">${escapeHtml(n.title)}</a></li>`).join('')}</ol>${tree.truncated?'<p>目次は一部のみ表示しています。各作品から下位の作品をたどれます。</p>':''}</nav>` : ''
  const chapters=embedded.items.map(n=>`<section class="initial-work-chapter"><h3><a href="${escapeHtml(publicLink(origin,n.id))}">${escapeHtml(n.path)}</a></h3>${textBlock(n.body)}</section>`).join('')
  const more=embedded.limited?'<p>収録作品の本文は先頭の一部を表示しています。残りは目次から各作品の全文を読めます。</p>':''
  const status=work.status==='open'?'自由公開（未審査）':'審査済み公開'
  const author=work.pen_name?`<p>作者：${escapeHtml(work.pen_name)}${work.contributor_credit?' ／ 入力・構成：'+escapeHtml(work.contributor_credit):''}</p>`:''
  const content=`<main class="initial-public-work" style="max-width:850px;margin:2rem auto;padding:1rem;font-family:serif;line-height:1.45;overflow-wrap:anywhere">
    <header><p><a href="/">余白。</a></p><h1>${escapeHtml(work.title)}</h1>${author}<p>${status}</p></header>
    ${work.summary?`<p>${escapeHtml(work.summary)}</p>`:''}
    ${work.body?`<details class="collapsible-body"><summary>本文（クリックで開く）</summary><article aria-label="作品本文">${textBlock(work.body)}</article></details>`:''}
    ${toc}${chapters?`<details class="collapsible-body"><summary>下位作品の本文（クリックで開く）</summary><section aria-label="下位作品の本文">${chapters}${more}</section></details>`:more}
    ${info}${refs}
    <footer><p>外部取得用：<a href="${escapeHtml(origin)}/api/public/works/${escapeHtml(work.id)}/content">本文JSON API（認証不要）</a></p></footer>
   </main>`
  // 既存descriptionを二重にせず、metaとタイトルを作品ごとに更新する。
  return template.replace(/<meta\s+name=["']description["'][^>]*>/i,'')
    .replace(/<title>[^<]*<\/title>/i,`<title>${escapeHtml(title)}</title>`)
    .replace(/<\/head\s*>/i,meta+'</head>')
    .replace(root,`<div id="root">${content}</div>`)
}

export async function servePublicWorkHtml(request, env) {
  if(request.method!=='GET' && request.method!=='HEAD') return null
  const url=new URL(request.url)
  const match=/^\/works\/([^/]+)\/?$/i.exec(url.pathname)
  if(!match || !isUuid(match[1])) return null
  const config=runtimeConfig(env)
  if(!config || !env.ASSETS?.fetch) return null // 既存SPAを壊さない
  try {
    const work=await getWork(env,match[1])
    if(!work) return null // 下書き・非公開・存在しないIDはSSRしない

    const assetRequest=request.method==='HEAD' ? new Request(request.url,{method:'GET'}) : request
    const shell=await env.ASSETS.fetch(assetRequest)
    if(!shell.ok || !shell.headers.get('content-type')?.includes('text/html')) return shell
    const template=await shell.text()
    const [refsResult,treeResult]=await Promise.allSettled([
      getReferences(env,work.id),
      loadPublicTree(env,work.id)
    ])
    const references=refsResult.status==='fulfilled'?refsResult.value:[]
    const tree=treeResult.status==='fulfilled'?treeResult.value:{items:[],truncated:false}
    let embedded={items:[],limited:false}
    if(tree.items.length) {
      try {
        const scan=tree.items.slice(0,MAX_SCAN)
        const candidates=[]
        let scanned=0, foundBodies=0
        for(let i=0;i<scan.length && foundBodies<MAX_INLINE_WORKS;i+=12) {
          const batch=scan.slice(i,i+12)
          const batchBodies=await getVisibleBodies(env,batch)
          candidates.push(...batchBodies)
          foundBodies+=batchBodies.filter(n=>n.body?.trim()).length
          scanned+=batch.length
        }
        let total=0
        for (const node of candidates) {
          if(!node.body?.trim())continue
          if (embedded.items.length>=MAX_INLINE_WORKS || total+node.body.length>MAX_INLINE_CHARS) {embedded.limited=true;break}
          embedded.items.push(node)
          total+=node.body.length
        }
        if(tree.items.length>scanned || candidates.filter(n=>n.body?.trim()).length>embedded.items.length) embedded.limited=true
      } catch { embedded.limited=true }
    }
    const result=renderPublicWorkHtml(template,work,references,tree,embedded,url.origin)
    if(!result)return new Response(template,{headers:shell.headers})
    const headers=new Headers(shell.headers)
    headers.set('content-type','text/html; charset=utf-8')
    headers.set('cache-control','no-store') // 非公開化後のHTMLをエッジに長期間残さない
    headers.set('x-content-type-options','nosniff')
    headers.delete('content-length')
    headers.delete('content-encoding')
    headers.delete('etag')
    headers.delete('last-modified')
    return new Response(request.method==='HEAD'?null:result,{status:200,headers})
  } catch {
    // DB異常/環境変数の問題で共有ページを失わないようReact版にフォールバック。
    return null
  }
}
