import {encodeGenres} from './classifications.js'
import { normalizeReferenceUrl } from './referenceUrl.js'
import { packReference } from './referenceAnnotations.js'
// Draft creation and autosave payloads shared by the editor and tests.
export const draftCacheKey=(uid,id,revision=false)=>`yohaku:edit:${uid||'guest'}:${revision?'revision:':''}${id||'new'}`
export function getDraftCache(key,serverUpdatedAt){
  try {
    const cached=JSON.parse(localStorage.getItem(key)||'null')
    if(!cached||typeof cached!=='object'||!cached.fields||!Array.isArray(cached.refs))return null
    if(serverUpdatedAt && cached.savedAt<=new Date(serverUpdatedAt).getTime())return null
    return cached
  } catch {return null}
}
export function createEmptyDraftPayload(kind='work',parent=null){
  const section=parent?.section||'文学'
  return {p_id:null,p_pen_name:parent?.pen_name||'',p_contributor_credit:parent?.contributor_credit||'',p_section:section,p_title:'',p_genre:encodeGenres(parent?.genre||[]),p_theme:'',p_summary:'',p_body:'',p_question:'',p_inheritance:'',p_novelty:'',p_status:'draft',p_parent_work_id:parent?.id||null,p_order_index:Math.min(9999,Math.max(0,Number(parent?.next_order_index)||0)),p_node_kind:kind,p_references:[]}
}
export function toWorkPayload(fields,refs,{id,status,revisionMode=false,changeNote=''}){
  return {p_id:id||null,p_pen_name:fields.pen_name.trim(),p_contributor_credit:fields.contributor_credit.trim(),p_section:fields.section,p_title:fields.title.trim(),p_genre:encodeGenres(fields.genre),p_theme:fields.theme.trim(),p_summary:fields.summary.trim(),p_body:fields.body,p_question:fields.question.trim(),p_inheritance:fields.inheritance.trim(),p_novelty:fields.novelty.trim(),p_status:status,p_parent_work_id:fields.parent_work_id||null,p_order_index:Number(fields.order_index)||0,p_node_kind:fields.node_kind,p_references:refs.map(r=>({title:packReference(r).title,relation:r.relation.trim(),url:normalizeReferenceUrl(r.url)})),...(revisionMode?{p_change_note:changeNote.trim()}:{})}
}
