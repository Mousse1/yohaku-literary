// A stable owner-library outline; parents precede their descendants.
// Missing parents and cycles should not hide any work from the library.
import { orderWorks } from './workHierarchy.js'

export function organizeOwnerWorks(works = []) {
  const valid = works.filter(w => w && w.id)
  const byId = new Map(valid.map(w => [w.id, w]))
  const childMap = new Map()
  for (const work of valid) {
    const parentId = work.parent_work_id && byId.has(work.parent_work_id) && work.parent_work_id !== work.id
      ? work.parent_work_id : null
    if (!childMap.has(parentId)) childMap.set(parentId, [])
    childMap.get(parentId).push(work)
  }
  for (const children of childMap.values()) children.sort(orderWorks)
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
    const descendantCount = children.reduce((sum, child) => sum + child.descendantCount + 1, 0)
    return {
      work,
      children,
      descendantCount,
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
  for (const work of [...valid].sort(orderWorks)) {
    if (!visited.has(work.id)) {
      const node = build(work)
      if (node) roots.push(node)
    }
  }
  return roots
}
