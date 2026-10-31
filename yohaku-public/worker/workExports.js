// 余白。v7.5.9 — 公開作品のファイル出力。
// 入力は公開IDのみ。Supabaseの匿名権限と公開ステータスで確認してから生成する。
import {isUuid, runtimeConfig, getWork, getReferences, loadPublicTree, getVisibleDetails, getReferenceIndex} from './publicWorksApi.js'
import {renderAnnotatedPlainText} from '../src/annotationMarkers.js'

const MAX_EXPORT_CHARS = 2_000_000
const MAX_EXPORT_NODES = 240
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const canonicalUrl = (origin,id) => `${origin}/works/${id}`

function textLines(record, origin, isRoot=false) {
  const w=record.work
  const parts=[`${isRoot?'#':'##'} ${record.path || w.title || '無題'}`]
  if(w.pen_name) parts.push(`作者：${w.pen_name}`)
  if(w.contributor_credit) parts.push(`入力・構成：${w.contributor_credit}`)
  parts.push(`公開種別：${w.status==='open'?'自由公開（未審査）':'審査済み公開'}`)
  parts.push(`URL：${canonicalUrl(origin,w.id)}`)
  for(const [heading,key] of [['概要','summary'],['この作品が問うこと','question'],['先行作品から継承するもの','inheritance'],['新たに試みること','novelty']]) {
    if(w[key]) parts.push(`${heading}\n${w[key]}`)
  }
  if(w.body) parts.push(`本文\n${w.body}`)
  if(record.references.length)parts.push('参考文献・関連作品\n'+record.references.map(r=>`・${r.title}${r.relation?' — '+r.relation:''}${r.url?'\n  '+r.url:''}`).join('\n'))
  return parts.join('\n\n')
}

export function renderExportText(doc, origin, markdown=false) {
  const title=`${doc.root.title || '無題'} — 余白。`
  const sections=doc.records.map((record,index)=>{
    const raw=textLines(record,origin,index===0)
    if(!markdown) return raw.replace(/^#{1,2} /,'')
    return raw
  })
  const separator=markdown?'\n\n---\n\n':'\n\n'+'─'.repeat(24)+'\n\n'
  return `${title}\n公開作品の複製元：${canonicalUrl(origin,doc.root.id)}\n\n${sections.join(separator)}\n`
}

const htmlBlock=(value,klass='export-text')=>value?`<div class="${klass}">${renderAnnotatedPlainText(value,escapeHtml)}</div>`:''
function htmlRecord(record, origin, main=false) {
  const w=record.work
  const heading=main?'h1':'h2'
  const info=[['作品の概要','summary'],['この作品が問うこと','question'],['先行作品から継承するもの','inheritance'],['新たに試みること','novelty']]
    .filter(([,key])=>w[key])
    .map(([title,key])=>`<section class="meta-section"><h3>${escapeHtml(title)}</h3>${htmlBlock(w[key])}</section>`).join('')
  const refs=record.references.length?`<section class="meta-section"><h3>参考文献・関連作品</h3><ul>${record.references.map(r=>`<li>${escapeHtml(r.title)}${r.relation?' — '+escapeHtml(r.relation):''}${r.url?`<div><a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a></div>`:''}</li>`).join('')}</ul></section>`:''
  return `<article class="export-record${main?' is-root':''}"><${heading}>${escapeHtml(record.path||w.title||'無題')}</${heading}><p class="credits">作者：${escapeHtml(w.pen_name||'不明')}${w.contributor_credit?' ／ 入力・構成：'+escapeHtml(w.contributor_credit):''} ・ ${w.status==='open'?'自由公開（未審査）':'審査済み公開'}</p>${w.body?`<section class="body-section">${htmlBlock(w.body)}</section>`:''}${info}${refs}<p class="source-url"><a href="${escapeHtml(canonicalUrl(origin,w.id))}">${escapeHtml(canonicalUrl(origin,w.id))}</a></p></article>`
}
export function renderExportHtml(doc, origin) {
  const title=`${doc.root.title||'無題'}｜余白。`
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} — 印刷・PDF保存</title><style>
@page{size:A4;margin:19mm 18mm}*{box-sizing:border-box}html{background:#eeeae1}body{margin:0;color:#272722;font-family:"Noto Serif JP","Yu Mincho","Hiragino Mincho ProN",serif;font-size:12pt;line-height:1.55}.controls{position:sticky;top:0;background:#eeeae1;padding:13px 20px;display:flex;justify-content:center;align-items:center;gap:12px;font-family:system-ui,sans-serif;font-size:13px}.controls button{background:#272722;color:#fff;border:0;padding:10px 20px;border-radius:4px;cursor:pointer}.controls a{color:#82513b}.sheet{background:white;max-width:210mm;padding:24mm 19mm;margin:12px auto;box-shadow:0 6px 40px #0002}.export-record{break-before:page}.export-record.is-root{break-before:auto}.export-record h1{font-size:25pt;line-height:1.45}.export-record h2{font-size:19pt;line-height:1.5}.export-record h3{font-size:12pt;margin:18pt 0 6pt}.credits,.source-url{color:#65645e;font-size:9pt;line-height:1.6}.export-text{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;line-height:1.45;margin:12pt 0}.meta-section{break-inside:avoid-page}.meta-section .export-text{font-size:11pt}.source-url{margin-top:20pt;overflow-wrap:anywhere}.source-url a{color:#654a3b}.export-record li{margin:4pt 0;overflow-wrap:anywhere}sup.annotation-marker{font-size:.68em;line-height:0;vertical-align:super}
@media print{html{background:white}.controls{display:none}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.export-record{break-before:page}.export-record.is-root{break-before:auto}a{color:inherit;text-decoration:none}}
</style></head><body><div class="controls"><button type="button" onclick="window.print()">印刷・PDFとして保存</button><a href="${escapeHtml(canonicalUrl(origin,doc.root.id))}">作品に戻る</a><span>印刷先で「PDFに保存」を選択してください</span></div><main class="sheet">${doc.records.map((r,i)=>htmlRecord(r,origin,i===0)).join('')}</main></body></html>`
}

// 可能な範囲だけの黙った書き出しは行わない。上限を超えたら明確なエラーにする。
export async function loadExportDocument(env, id) {
  const root=await getWork(env,id)
  if(!root) return null
  const tree=await loadPublicTree(env,id,MAX_EXPORT_NODES)
  if(tree.truncated || tree.items.length>=MAX_EXPORT_NODES) return {error:'too_many_works'}
  let total=String(root.body||'').length
  const records=[{work:root,path:root.title,references:[]}]
  for(let i=0;i<tree.items.length;i+=12){
    const batch=await getVisibleDetails(env,tree.items.slice(i,i+12))
    for(const child of batch) {
      total+=String(child.body||'').length
      if(total>MAX_EXPORT_CHARS)return {error:'document_too_large'}
      records.push({work:child,path:child.path,references:[]})
    }
  }
  if(total>MAX_EXPORT_CHARS) return {error:'document_too_large'}
  // 文献は、本文の出力失敗を招かないために追加情報として取得する。
  // 各グループ・本文自身の参考文献も含める。
  const refs=await getReferenceIndex(env,records.map(r=>r.work.id))
  for(const record of records)record.references=refs.get(record.work.id)||[]
  // 旧形式のRLSや参照実装にも対応する。ルート文献は補足情報として単独取得。
  if(!records[0].references.length)records[0].references=await getReferences(env,id)
  return {root,records}
}

const noStore={'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}
const plainError=(message,status,method)=>new Response(method==='HEAD'?null:message,{status,headers:{...noStore,'content-type':'text/plain; charset=utf-8'}})
export async function serveWorkExport(request,env){
  const url=new URL(request.url)
  const match=/^\/export\/works\/([0-9a-f-]{36})(?:\.(txt|md)|\/(print))\/?$/i.exec(url.pathname)
  if(!match || !isUuid(match[1]))return null
  if(!['GET','HEAD'].includes(request.method))return plainError('この操作には対応していません。',405,request.method)
  if(!runtimeConfig(env))return plainError('ファイルの生成に必要な接続設定がありません。',503,request.method)
  try {
    const doc=await loadExportDocument(env,match[1])
    if(!doc)return plainError('この作品は公開されていないか、存在しません。',404,request.method)
    if(doc.error)return plainError(doc.error==='too_many_works'?'収録作品が多いため、下位作品ごとに出力してください。':'本文の合計が大きいため、下位作品ごとに出力してください。',413,request.method)
    const origin=url.origin
    const printable=Boolean(match[3]);const markdown=match[2]==='md'
    const body=printable?renderExportHtml(doc,origin):renderExportText(doc,origin,markdown)
    const type=printable?'text/html':markdown?'text/markdown':'text/plain'
    const fileType=markdown?'md':'txt'
    const filename=encodeURIComponent(String(doc.root.title||'作品').replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,90)||'作品')
    return new Response(request.method==='HEAD'?null:body,{headers:{...noStore,'content-type':`${type}; charset=utf-8`,...(!printable?{'content-disposition':`attachment; filename="yohaku.${fileType}"; filename*=UTF-8''${filename}.${fileType}`}:{})}})
  
} catch (error) {
  console.error(
    "[File export]",
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "unknown"
  );

  return plainError(
    'ファイルを生成できませんでした。時間をおいて再度お試しください。',
    503,
    request.method
  );
}
