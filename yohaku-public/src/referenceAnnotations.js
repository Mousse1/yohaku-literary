// Store an explicit bibliography-to-footnote association in the existing title
// field. No schema/RPC change is required, including for approved revisions.
// The prefix is visible in JSON/export; the reader/editor separate it for display.
const PREFIX = /^【\*([1-9][0-9]{0,5})】\s*/u
const validNumber = value => /^[1-9][0-9]{0,5}$/.test(String(value ?? '').trim())

export function unpackReference(reference = {}) {
  reference = reference && typeof reference === 'object' ? reference : {}
  const title = String(reference.title || '')
  const match = PREFIX.exec(title)
  return {
    ...reference,
    title: match ? title.slice(match[0].length) : title,
    annotationNumber: match ? match[1] : (validNumber(reference.annotation_number ?? reference.annotationNumber) ? String(Number(reference.annotation_number ?? reference.annotationNumber)) : ''),
  }
}
export function packReference(reference = {}) {
  const {title, annotationNumber, ...rest} = unpackReference(reference)
  const rawNumber = String(reference.annotationNumber ?? annotationNumber ?? '').trim()
  const number = validNumber(rawNumber) ? String(Number(rawNumber)) : ''
  return { ...rest, title: `${number ? `【*${number}】 ` : ''}${String(title).trim()}` }
}
export function referenceForNumber(references = [], value) {
  const number = String(Number(value))
  return (Array.isArray(references) ? references : []).find(ref => ref && unpackReference(ref).annotationNumber === number) || null
}
export function validateReferenceNumbers(references = []) {
  const seen = new Set()
  for(const ref of references){
    const number = String(ref.annotationNumber ?? unpackReference(ref).annotationNumber ?? '').trim()
    if (!number) continue
    if (!validNumber(number) || seen.has(String(Number(number)))) return false
    seen.add(String(Number(number)))
  }
  return true
}
export function packedTitleLength(ref) {
  return packReference(ref).title.length
}

// Database rows must not turn into objects used as React children.
export function readableText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
export function normalizeReferences(value) {
  return (Array.isArray(value)?value:[]).filter(row=>row && typeof row==='object').map(row=>({
    ...row, title:readableText(row.title), relation:readableText(row.relation), url:readableText(row.url),
  }))
}

// Ancestors are ordered nearest first. Unnumbered references remain local.
export function inheritedNumberedReferences(work,ancestors=[]) {
  const own=normalizeReferences(work.work_references??work.references);
  const output=[...own];
  const seen=new Set(own.map(r=>unpackReference(r).annotationNumber).filter(Boolean));
  for(const ancestor of ancestors){
    const additions=normalizeReferences(ancestor.work_references??ancestor.references).filter(r=>{
      const number=unpackReference(r).annotationNumber;
      return number&&!seen.has(number);
    });
    for(const ref of additions){
      const number=unpackReference(ref).annotationNumber;
      output.push({...ref,source_work_id:ref.source_work_id||ancestor.id,source_title:ref.source_title||ancestor.title});
      seen.add(number);
    }
  }
  return output;
}

export async function loadReferenceAncestors(work,loadParent) {
  const ancestors=[];const visited=new Set([work.id]);let id=work.parent_work_id;
  while(id&&ancestors.length<12&&!visited.has(id)){
    visited.add(id);
    const parent=await loadParent(id);
    if(!parent)break;
    ancestors.push(parent);id=parent.parent_work_id;
  }
  return ancestors;
}

export function inheritDocumentReferences(records,externalAncestors=[]) {
  const index=new Map(externalAncestors.map(w=>[w.id,w]));const parents=[];
  for(const record of records){
    const work={...record.work,references:record.references};
    const depth=record.depth||0;
    if(!work.parent_work_id&&depth>0)work.parent_work_id=parents[depth-1];
    parents[depth]=work.id;parents.length=depth+1;index.set(work.id,work);
  }
  for(const record of records){
    const work=index.get(record.work.id);const ancestors=[];const visited=new Set([work.id]);let id=work.parent_work_id;
    while(id&&ancestors.length<12&&!visited.has(id)){
      visited.add(id);const parent=index.get(id);if(!parent)break;
      ancestors.push(parent);id=parent.parent_work_id;
    }
    record.references=inheritedNumberedReferences(work,ancestors);
  }
  return records;
}
