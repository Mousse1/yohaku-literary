import {orderWorks} from './workHierarchy.js'

// Stay within one top-level work. At the end of a chapter, continue with the
// next sibling of its parent; never jump into an unrelated top-level book.
export function readingNeighbors(nodes=[],work) {
  const empty={previous:null,next:null}
  const publicWork=w=>w&&['published','open'].includes(w.status)
  if(!publicWork(work)||!work.id)return empty
  const byId=new Map(nodes.filter(publicWork).map(w=>[w.id,w]))
  byId.set(work.id,work)
  const neighbor=direction=>{
    let cursor=work;const seen=new Set()
    for(let depth=0;depth<13&&cursor?.parent_work_id;depth++){
      if(seen.has(cursor.id)||cursor.parent_work_id===cursor.id)return null
      seen.add(cursor.id)
      const siblings=[...byId.values()].filter(w=>w.parent_work_id===cursor.parent_work_id).sort(orderWorks)
      const index=siblings.findIndex(w=>w.id===cursor.id)
      const candidate=index>=0?siblings[index+direction]:null
      if(candidate&&!seen.has(candidate.id))return candidate
      cursor=byId.get(cursor.parent_work_id)
    }
    return null
  }
  return {previous:neighbor(-1),next:neighbor(1)}
}
