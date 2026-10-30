// Published-work navigation. This file is pure JavaScript to keep sorting and
// path construction testable independently of React and Supabase.
export const orderWorks = (a, b) =>
  (Number(a.order_index) || 0) - (Number(b.order_index) || 0) ||
  String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
  String(a.title || '').localeCompare(String(b.title || ''), 'ja')

export function hierarchyEntries(works = []) {
  const valid = works.filter(w => w && w.id)
  const byId = new Map(valid.map(w => [w.id, w]))
  const children = new Map()
  for (const w of valid) {
    const key = w.parent_work_id && byId.has(w.parent_work_id) && w.parent_work_id !== w.id
      ? w.parent_work_id : null
    if (!children.has(key)) children.set(key, [])
    children.get(key).push(w)
  }
  for (const items of children.values()) items.sort(orderWorks)
  const result = [], seen = new Set()
  function walk(work, ancestors = []) {
    if (seen.has(work.id) || ancestors.length > 12) return
    seen.add(work.id)
    const titles = [...ancestors.map(x => x.title), work.title]
    result.push({ ...work, depth: ancestors.length, path: titles.join(' › '), ancestorIds: ancestors.map(x => x.id) })
    for (const child of children.get(work.id) || []) walk(child, [...ancestors, work])
  }
  for (const root of children.get(null) || []) walk(root)
  // Corrupt cycles should not hide every work from the picker.
  for (const w of [...valid].sort(orderWorks)) if (!seen.has(w.id)) walk(w)
  return result
}

export const descendantsOf = (entries, id) =>
  entries.filter(entry => entry.ancestorIds.includes(id))

export const hierarchicalLabel = entry =>
  `${entry.depth ? '　'.repeat(Math.min(entry.depth, 8)) + '↳ ' : '▣ '}${entry.path}`
