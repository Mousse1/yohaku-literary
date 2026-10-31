import {decodeGenres} from '../src/classifications.js'
// 公開作品URLを、本文を含む初期HTMLとして返す。
// 公開全文のみ。接続失敗・上限超過は空のSPAではなく明示的なエラーを返す。
import {isUuid, runtimeConfig, loadPublicDocument} from './publicWorksApi.js'
import {annotationSegments} from '../src/annotationMarkers.js'
import {publicReference, annotationLinks} from './publicAnnotations.js'

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const publicLink = (origin,id) => `${origin}/works/${id}`

// テキストはエスケープしてからpre-wrap表示。Markdown原文・改行・段落冒頭の字下げを保護する。
function textBlock(text, className='initial-work-body', scope='') {
  if (!text) return ''
  return `<div class="${className}" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45">${annotationSegments(text).map(p=>p.type==='marker'?`<a role="doc-noteref" href="#ref-${escapeHtml(scope)}-${p.number}" aria-label="注釈 ${p.number}">${p.stars}<sup>${p.number}</sup></a>`:escapeHtml(p.value)).join('')}</div>`
}

export function renderPublicWorkHtml(template, work, references, tree, embedded, origin) {
  // build後の index.html（CSS/JSアセット参照）をそのまま使う。
  // この関数は初期表示のHTMLだけを作り、クライアントの読書画面を置き換えない。
  const root=/<div\s+id=["']root["']\s*>\s*<\/div>/i
  if (!root.test(template) || !/<\/head\s*>/i.test(template)) return null
  const title=`${work.title||'作品'}｜余白。`
  const canonical=publicLink(origin,work.id)
  const description=String(work.summary||work.body||work.title||'').replace(/\s+/g,' ').slice(0,160)
  const normalizedRefs=references.map(publicReference)
  const structured={
    '@context':'https://schema.org','@type':'CreativeWork','@id':canonical,url:canonical,name:work.title,
    author:{'@type':'Person',name:work.pen_name||'不明'},inLanguage:'ja',description,
    text:work.body||'',genre:decodeGenres(work.genre),datePublished:work.created_at,dateModified:work.updated_at,
    encoding:[{'@type':'MediaObject',encodingFormat:'text/markdown',contentUrl:`${canonical}.md`},{'@type':'MediaObject',encodingFormat:'application/json',contentUrl:`${origin}/api/public/works/${work.id}`}],
    hasPart:embedded.items.map(n=>({'@type':'CreativeWork','@id':publicLink(origin,n.id),name:n.title,position:tree.items.findIndex(t=>t.id===n.id)+1})),
    citation:normalizedRefs.map(r=>({'@type':'CreativeWork',name:r.title,...(r.url?{url:r.url}:{})}))
  }
  const ld=JSON.stringify(structured).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
  const meta=`<link rel="alternate" type="text/markdown" title="作品全文Markdown" href="${escapeHtml(canonical)}.md">`+
    `<script type="application/ld+json">${ld}</script>`+`<link rel="alternate" type="application/json" title="作品全文JSON" href="${escapeHtml(origin)}/api/public/works/${escapeHtml(work.id)}">`+
    `<meta name="description" content="${escapeHtml(description)}">`+
    `<link rel="canonical" href="${escapeHtml(canonical)}">`+
    `<meta property="og:type" content="article">`+
    `<meta property="og:title" content="${escapeHtml(title)}">`+
    `<meta property="og:description" content="${escapeHtml(description)}">`+
    `<meta property="og:url" content="${escapeHtml(canonical)}">`

  const info=[work.question&&['この作品が問うこと',work.question],work.inheritance&&['先行作品から継承するもの',work.inheritance],work.novelty&&['新たに試みること',work.novelty]]
    .filter(Boolean).map(([label,content])=>`<section><h2>${escapeHtml(label)}</h2>${textBlock(content,'initial-work-position')}</section>`).join('')
  const refs=referenceBlock(normalizedRefs,work.id,work)
  const toc=tree.items.length ? `<nav aria-label="収録作品の目次"><h2>目次・収録作品</h2><ol>${tree.items.map(n=>`<li style="margin-left:${Math.min(n.depth,10)*12}px"><a href="${escapeHtml(publicLink(origin,n.id))}">${escapeHtml(n.title)}</a></li>`).join('')}</ol>${tree.truncated?'<p>目次は一部のみ表示しています。各作品から下位の作品をたどれます。</p>':''}</nav>` : ''
  const chapters=embedded.items.map(n=>`<section class="initial-work-chapter ${n.node_kind==='collection'?'is-group':'is-body'}" id="chapter-${escapeHtml(n.id)}"><h3><a href="${escapeHtml(publicLink(origin,n.id))}">${escapeHtml(n.title||'本文')}</a></h3><p>作者：${escapeHtml(n.pen_name||work.pen_name||'不明')}</p>${n.body?`<details class="collapsible-body"><summary>本文（クリックで開く）</summary>${textBlock(n.body,'initial-work-body',n.id)}</details>`:''}${referenceBlock((n.references||[]).map(publicReference),n.id,n)}${noteBlock(n.notes)}</section>`).join('')
  const more=embedded.limited?'<p>収録作品の本文は先頭の一部を表示しています。残りは目次から各作品の全文を読めます。</p>':''
  const status=work.status==='open'?'自由公開（未審査）':'審査済み公開'
  const author=work.pen_name?`<p>作者：${escapeHtml(work.pen_name)}${work.contributor_credit?' ／ 入力・構成：'+escapeHtml(work.contributor_credit):''}</p>`:''
  const content=`<main class="initial-public-work" style="max-width:850px;margin:2rem auto;padding:1rem;font-family:serif;line-height:1.45;overflow-wrap:anywhere">
    <header><p><a href="/">余白。</a></p><h1>${escapeHtml(work.title)}</h1>${author}<p>${status}</p></header>
    ${work.summary?`<p>${escapeHtml(work.summary)}</p>`:''}
    ${work.body?`<details class="collapsible-body"><summary>本文（クリックで開く）</summary><article aria-label="作品本文">${textBlock(work.body,'initial-work-body',work.id)}</article></details>`:''}
    ${toc}${chapters?`<section aria-label="下位作品の本文">${chapters}${more}</section>`:more}
    ${info}${refs}${noteBlock(embedded.rootNotes)}
    <footer><p>外部取得用：<a href="${escapeHtml(canonical)}.md">作品全文Markdown</a> ／ <a href="${escapeHtml(origin)}/api/public/works/${escapeHtml(work.id)}">作品全文JSON</a> ／ <a href="${escapeHtml(origin)}/api/public/works/${escapeHtml(work.id)}/content">本文JSON API（認証不要）</a></p></footer>
   </main>`
  // 既存descriptionを二重にせず、metaとタイトルを作品ごとに更新する。
  return template.replace(/<meta\s+name=["']description["'][^>]*>/i,'')
    .replace(/<title>[^<]*<\/title>/i,()=>`<title>${escapeHtml(title)}</title>`)
    .replace(/<\/head\s*>/i,()=>meta+'</head>')
    .replace(root,()=>`<div id="root">${content}</div>`)
}


function referenceBlock(references,workId,work={id:workId}) {
  const missing=annotationLinks(work,references).filter(a=>!a.resolved).map(a=>`<li id="ref-${escapeHtml(workId)}-${a.number}">注釈 *${a.number}: 対応する参考文献は未登録です。</li>`).join('')
  return references.length||missing?`<section aria-label="参考文献・関連作品"><h2>参考文献・関連作品</h2><ul>${references.map((r,index)=>`<li id="ref-${escapeHtml(workId)}-${r.annotation_number||'item-'+index}">${r.annotation_number?`注釈 *${r.annotation_number}: `:''}${r.url?`<a href="${escapeHtml(r.url)}" rel="noopener noreferrer">${escapeHtml(r.title)}</a>`:escapeHtml(r.title)}${r.relation?' — '+escapeHtml(r.relation):''}${r.url?` <span>${escapeHtml(r.url)}</span>`:''}</li>`).join('')}${missing}</ul></section>`:''
}
function noteBlock(notes=[]) {
  return notes.length?`<section aria-label="公開された読者の注釈"><h2>公開された読者の注釈・異論</h2>${notes.map(n=>`<article><h3>${escapeHtml(n.type)} — ${escapeHtml(n.pen_name)}</h3>${textBlock(n.body,'initial-reader-note')}</article>`).join('')}</section>`:''
}
function htmlError(message,status,method) {
  return new Response(method==='HEAD'?null:`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>余白。</title></head><body><p>${escapeHtml(message)}</p><a href="/">作品一覧へ</a></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(status===405?{allow:'GET, HEAD'}:{})}})
}
export async function servePublicWorkHtml(request, env) {
  const url=new URL(request.url)
  const match=/^\/works\/([^/]+)\/?$/i.exec(url.pathname)
  if(!match)return null
  if(!isUuid(match[1]))return htmlError('この作品は公開されていないか、存在しません。',404,request.method)
  if(!['GET','HEAD'].includes(request.method))return htmlError('この操作には対応していません。',405,request.method)
  if(!runtimeConfig(env)||!env.ASSETS?.fetch)return htmlError('公開作品の接続設定を確認してください。',503,request.method)
  try {
    const doc=await loadPublicDocument(env,match[1])
    if(!doc)return htmlError('この作品は公開されていないか、存在しません。',404,request.method)
    if(doc.error)return htmlError('作品全体が出力上限を超えています。章ごとのURLを利用してください。',413,request.method)
    // Fetch the actual shell explicitly. Asset SPA fallback may require browser
    // navigation headers, which ordinary HTTP clients and AI fetchers do not send.
    const shell=await env.ASSETS.fetch(new Request(new URL('/index.html',url.origin),{method:'GET'}))
    if(!shell.ok||!shell.headers.get('content-type')?.includes('text/html'))return htmlError('公開ページの生成に失敗しました。',503,request.method)
    const template=await shell.text()
    const nodes=doc.records.slice(1).map(r=>({...r.work,path:r.path,depth:r.depth,references:r.references,notes:r.notes}))
    const result=renderPublicWorkHtml(template,doc.root,doc.records[0].references,{items:nodes,truncated:false},{items:nodes,limited:false,rootNotes:doc.records[0].notes},url.origin)
    if(!result)return htmlError('公開ページの生成に失敗しました。',503,request.method)
    const headers=new Headers(shell.headers)
    headers.set('content-type','text/html; charset=utf-8')
    headers.set('cache-control','no-store')
    headers.set('x-content-type-options','nosniff')
    headers.set('link',`<${url.origin}/works/${doc.root.id}>; rel="canonical", <${url.origin}/works/${doc.root.id}.md>; rel="alternate"; type="text/markdown", <${url.origin}/api/public/works/${doc.root.id}>; rel="alternate"; type="application/json"`)
    for(const name of ['content-length','content-encoding','etag','last-modified'])headers.delete(name)
    return new Response(request.method==='HEAD'?null:result,{status:200,headers})
  }catch{return htmlError('公開作品を取得できませんでした。時間をおいて再度お試しください。',503,request.method)}
}
