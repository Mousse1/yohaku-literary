// Pure helpers for quick reuse of another panel's work and title/ancestor search.
export function normalizeParallelSearch(input='') {
  return String(input??'').normalize('NFKC').toLocaleLowerCase('ja')
    .replace(/[›＞>／/]/g,' ').replace(/\s+/g,' ').trim()
}

export function searchParallelWorks(works=[],query='',limit=50) {
  const terms=normalizeParallelSearch(query).split(' ').filter(Boolean)
  return works.filter(w=>{
    if(!w?.id)return false
    const haystack=normalizeParallelSearch([w.title,w.path,w.pen_name].filter(Boolean).join(' '))
    return terms.every(term=>haystack.includes(term))
  }).slice(0,limit)
}

export function otherPanelWorks(panes=[],available=[],excludeKey) {
  const byId=new Map(available.map(w=>[w.id,w]))
  const seen=new Set()
  const selected=[]
  panes.forEach((pane,index)=>{
    if(pane.key===excludeKey || !pane.workId || seen.has(pane.workId))return
    const work=byId.get(pane.workId)
    if(!work)return
    seen.add(pane.workId)
    selected.push({index,work})
  })
  return selected
}
