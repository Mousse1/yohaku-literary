import {annotationSegments} from '../src/annotationMarkers.js'
import {unpackReference} from '../src/referenceAnnotations.js'

export function publicReference(row) {
  const ref=unpackReference(row)
  let url=null
  try {const parsed=new URL(ref.url);if(parsed.protocol==='https:')url=parsed.href}catch{}
  return {title:ref.title,relation:String(ref.relation||''),url,annotation_number:ref.annotationNumber||row.annotation_number||null}
}
export function annotationLinks(work,references=[]) {
  const numbers=[...new Set(annotationSegments(work.body).filter(p=>p.type==='marker').map(p=>p.number))]
  return numbers.map(number=>({number,scope_work_id:work.id,footnote_id:`work-${work.id}-note-${number}`,
    references:references.filter(r=>r.annotation_number===number),
    resolved:references.some(r=>r.annotation_number===number)}))
}
export function recordJson(record,origin) {
  const work=record.work
  return {...work,url:`${origin}/works/${work.id}`,markdown_url:`${origin}/works/${work.id}.md`,
    body_format:'markdown',path:record.path,depth:record.depth||work.depth||0,
    references:record.references,annotations:annotationLinks(work,record.references),notes:record.notes||[]}
}
// Convert editorial markers only. Ordinary Markdown, code and LaTeX stay intact.
export function markdownBody(work) {
  return annotationSegments(work.body).map(p=>p.type==='marker'?`[^work-${work.id}-note-${p.number}]`:p.value).join('')
}
