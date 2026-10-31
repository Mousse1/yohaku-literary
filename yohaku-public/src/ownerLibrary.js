// A stable owner-library outline; parents precede their descendants.
// Missing parents and cycles should not hide any work from the library.
// The most recently edited descendant lifts its parent group to the top.
const timestamp=work=>new Date(work.updated_at||work.created_at||0).getTime()||0
const recentFirst=(a,b)=>b.lastActivity-a.lastActivity || String(a.work.title||'').localeCompare(String(b.work.title||''),'ja')
const createdAt = work => Date.parse(work.created_at || '') || 0
const titleCompare = (a,b) => String(a.work.title||'').localeCompare(String(b.work.title||''),'ja')
const earliestCreated = (a,b) => createdAt(a.work)-createdAt(b.work) || String(a.work.id).localeCompare(String(b.work.id))

export const childSortOptions = [
  {value:'created_asc',label:'作成順（古い順・初期設定）'},
  {value:'created_desc',label:'作成順（新しい順）'},
  {value:'updated_desc',label:'更新順（新しい順）'},
  {value:'title',label:'作品名順'},
  {value:'manual',label:'手動の並び順（保存）'},
]

// Only root works use latest activity. A group's children have their own
// ordering mode and default to their original creation order.
export function sortGroupChildren(nodes, mode='created_asc') {
  const comparator = {
    created_asc: earliestCreated,
    created_desc: (a,b) => -earliestCreated(a,b),
    updated_desc: (a,b) => recentFirst(a,b) || earliestCreated(a,b),
    title: (a,b) => titleCompare(a,b) || earliestCreated(a,b),
    manual: (a,b) => (Number(a.work.order_index)||0)-(Number(b.work.order_index)||0) || earliestCreated(a,b),
  }[mode] || earliestCreated
  return [...nodes].sort(comparator)
}

export function moveSiblingIds(nodes, currentIndex, delta) {
  const nextIndex = currentIndex+delta
  if (currentIndex<0 || nextIndex<0 || nextIndex>=nodes.length) return null
  const ids = nodes.map(node=>node.work.id)
  ;[ids[currentIndex],ids[nextIndex]]=[ids[nextIndex],ids[currentIndex]]
  return ids
}

export function organizeOwnerWorks(works = [], {childSort='created_asc'} = {}) {
  const valid = works.filter(w => w && w.id)
  const byId = new Map(valid.map(w => [w.id, w]))
  const childMap = new Map()
  for (const work of valid) {
    const parentId = work.parent_work_id && byId.has(work.parent_work_id) && work.parent_work_id !== work.id
      ? work.parent_work_id : null
    if (!childMap.has(parentId)) childMap.set(parentId, [])
    childMap.get(parentId).push(work)
  }
  const visited = new Set()
  function build(work, parents = []) {
    if (visited.has(work.id)) return null
    visited.add(work.id)
    const children = []
    // The database normally prohibits cycles and excessive nesting. The guard
    // keeps the UI usable even when legacy data is malformed.
    if (parents.length < 20) {
      for (const child of childMap.get(work.id) || []) {
        const node = build(child, [...parents, work])
        if (node) children.push(node)
      }
    }
    const orderedChildren = sortGroupChildren(children,childSort)
    const descendantCount = orderedChildren.reduce((sum, child) => sum + child.descendantCount + 1, 0)
    const lastActivity=Math.max(timestamp(work),...orderedChildren.map(child=>child.lastActivity))
    const latestWork=orderedChildren.find(child=>child.lastActivity===lastActivity)?.latestWork||work
    return {
      work,
      children: orderedChildren,
      descendantCount,
      lastActivity,
      latestWork,
      depth: parents.length,
      path: [...parents.map(parent => parent.title), work.title].join(' › '),
      missingParent: Boolean(work.parent_work_id && !byId.has(work.parent_work_id)),
    }
  }
  const roots = []
  for (const work of childMap.get(null) || []) {
    const node = build(work)
    if (node) roots.push(node)
  }
  // An unexpected parent-cycle must not make the owner's documents disappear.
  for (const work of [...valid].sort((a,b)=>timestamp(b)-timestamp(a))) {
    if (!visited.has(work.id)) {
      const node = build(work)
      if (node) roots.push(node)
    }
  }
  return roots.sort(recentFirst)
}
