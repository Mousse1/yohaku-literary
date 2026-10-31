import {annotationLinks, markdownBody} from './publicAnnotations.js'
// 余白。v7.5.9 — 公開作品のファイル出力。
// 入力は公開IDのみ。Supabaseの匿名権限と公開ステータスで確認してから生成する。
import {isUuid, runtimeConfig, loadPublicDocument} from './publicWorksApi.js'
import {renderAnnotatedPlainText} from '../src/annotationMarkers.js'

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
  if(record.references.length)parts.push('参考文献・関連作品\n'+record.references.map(r=>`・${r.annotation_number?'注釈 *'+r.annotation_number+': ':''}${r.title}${r.relation?' — '+r.relation:''}${r.url?'\n  '+r.url:''}`).join('\n'))
  return parts.join('\n\n')
}

export function renderExportText(doc, origin, markdown=false) {
  if(markdown)return renderExportMarkdown(doc,origin)
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
  const refs=record.references.length?`<section class="meta-section"><h3>参考文献・関連作品</h3><ul>${record.references.map(r=>`<li>${r.annotation_number?'注釈 *'+r.annotation_number+': ':''}${escapeHtml(r.title)}${r.relation?' — '+escapeHtml(r.relation):''}${r.url?`<div><a href="${escapeHtml(r.url)}">${escapeHtml(r.url)}</a></div>`:''}</li>`).join('')}</ul></section>`:''
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
export const loadExportDocument = loadPublicDocument

const noStore={'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}
const plainError=(message,status,method)=>new Response(method==='HEAD'?null:message,{status,headers:{...noStore,'content-type':'text/plain; charset=utf-8'}})

export async function serveWorkExport(request, env) {
  const url = new URL(request.url);

  const direct=/^\/works\/([^/]+)\.md\/?$/i.exec(url.pathname)
  if(direct && !isUuid(direct[1]))return plainError('作品が見つかりません。',404,request.method)
  const match = direct ? [direct[0],direct[1],'md',null] :
    /^\/export\/works\/([0-9a-f-]{36})(?:\.(txt|md)|\/(print))\/?$/i.exec(
      url.pathname
    );

  if (!match || !isUuid(match[1])) return null;

  if (!["GET", "HEAD"].includes(request.method)) {
    return plainError(
      "この操作には対応していません。",
      405,
      request.method
    );
  }

  if (!runtimeConfig(env)) {
    return plainError(
      "ファイルの生成に必要な接続設定がありません。",
      503,
      request.method
    );
  }

  try {
    const doc = await loadExportDocument(env, match[1]);

    if (!doc) {
      return plainError(
        "この作品は公開されていないか、存在しません。",
        404,
        request.method
      );
    }

    if (doc.error) {
      return plainError(
        doc.error === "too_many_works"
          ? "収録作品が多いため、下位作品ごとに出力してください。"
          : "本文の合計が大きいため、下位作品ごとに出力してください。",
        413,
        request.method
      );
    }

    const origin = url.origin;
    const printable = Boolean(match[3]);
    const markdown = match[2] === "md";

    const body = printable
      ? renderExportHtml(doc, origin)
      : renderExportText(doc, origin, markdown);

    const type = printable
      ? "text/html"
      : markdown
        ? "text/markdown"
        : "text/plain";

    const fileType = markdown ? "md" : "txt";

    const filename = encodeURIComponent(
      String(doc.root.title || "作品")
        .replace(/[\\/\x00-\x1f\x7f]/g, "_")
        .slice(0, 90) || "作品"
    );

    return new Response(
      request.method === "HEAD" ? null : body,
      {
        headers: {
          ...noStore,
          'access-control-allow-origin':'*',
          link:`<${canonicalUrl(origin,doc.root.id)}>; rel="canonical", <${origin}/api/public/works/${doc.root.id}>; rel="alternate"; type="application/json"`,
          "content-type": `${type}; charset=utf-8`,
          ...(!printable && !direct
            ? {
                "content-disposition":
                  `attachment; filename="yohaku.${fileType}"; filename*=UTF-8''${filename}.${fileType}`
              }
            : {})
        }
      }
    );

  } catch (error) {
    console.error("[File export]", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown"
    });

    return plainError(
      "ファイルを生成できませんでした。時間をおいて再度お試しください。",
      503,
      request.method
    );
  }
}

const mdLabel=value=>String(value||'').replace(/[\\`*_[\]<>]/g,'\\$&').replace(/[\r\n]+/g,' ')
export function renderExportMarkdown(doc,origin) {
  const parts=[`# ${mdLabel(doc.root.title||'無題')}`,`原文・canonical: ${canonicalUrl(origin,doc.root.id)}`,`JSON: ${origin}/api/public/works/${doc.root.id}`,
    '注釈は作品IDごとに区別します。各脚注は、その作品の本文の注釈番号と登録参考文献の明示的な対応を示します。読者の注釈は作者の参考文献とは別です。']
  if(doc.records.length>1)parts.push('## 章構成\n\n'+doc.records.slice(1).map(r=>`${'  '.repeat(Math.min((r.depth||1)-1,10))}- [${mdLabel(r.work.title)}](${canonicalUrl(origin,r.work.id)})`).join('\n'))
  for(const record of doc.records){
    const w=record.work
    parts.push(`## ${mdLabel(record.path||w.title)}`,`作品ID: ${w.id}\n\n作者: ${mdLabel(w.pen_name)}${w.contributor_credit?`\n\n入力・構成: ${mdLabel(w.contributor_credit)}`:''}`,`原文: ${canonicalUrl(origin,w.id)}`)
    for(const [label,key] of [['概要','summary'],['作品の問い','question'],['継承するもの','inheritance'],['新たに試みること','novelty']])if(w[key])parts.push(`### ${label}\n\n${w[key]}`)
    parts.push('### 本文',markdownBody(w))
    const annotations=annotationLinks(w,record.references)
    if(annotations.length)parts.push('### 本文の注釈と引用元の対応\n\n'+annotations.map(a=>{
      const content=a.references.length?a.references.map(r=>`${mdLabel(r.title)}${r.relation?' — '+mdLabel(r.relation):''}${r.url?' <'+r.url+'>':''}`).join(' / '):'対応する参考文献は未登録です。'
      return `[^${a.footnote_id}]: 注釈 *${a.number}（作品ID: ${w.id}）: ${content}`
    }).join('\n\n'))
    if(record.references.length)parts.push('### 参考文献・関連作品\n\n'+record.references.map(r=>`- ${r.annotation_number?'注釈 *'+r.annotation_number+': ':''}${mdLabel(r.title)}${r.relation?' — '+mdLabel(r.relation):''}${r.url?' <'+r.url+'>':''}`).join('\n'))
    if(record.notes?.length)parts.push('### 公開された読者の注釈・異論\n\n'+record.notes.map(n=>`#### ${mdLabel(n.type)} — ${mdLabel(n.pen_name)}\n\n${n.body}`).join('\n\n'))
  }
  return parts.join('\n\n')+'\n'
}
