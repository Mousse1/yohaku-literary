import React, { useEffect, useMemo, useState } from 'react'
import { configured, supabase, demoWorks, messageFor } from './client'
import RichBody from './RichBody'
import { descendantsOf, hierarchyEntries, readingPageEntries } from './workHierarchy'

// Read descendants by their parent IDs, not only from the homepage's cached
// index. This also works when the group is opened directly by a /works/:id URL.
// Fetch metadata first; retrieve the full bodies only for the displayed page.
const PAGE_SIZE = 6
const PUBLIC_STATUSES = ['published', 'open']
const MAX_LEVELS = 12
const MAX_NODES = 1000
const BATCH = 50

async function loadPublicDescendants(rootId) {
  const found = new Map()
  let parents = [rootId]
  let truncated = false
  for (let depth = 0; depth < MAX_LEVELS && parents.length; depth++) {
    const next = []
    for (let start = 0; start < parents.length; start += BATCH) {
      const pageParents = parents.slice(start, start + BATCH)
      // Each parent can own many chapters. Supabase/PostgREST may impose a
      // row limit, so paginate instead of silently dropping later chapters.
      for (let offset = 0; ; offset += 500) {
        const {data, error} = await supabase.from('works')
          .select('id,title,parent_work_id,order_index,node_kind,status,created_at')
          .in('parent_work_id', pageParents)
          .in('status', PUBLIC_STATUSES)
          .order('id', {ascending:true})
          .range(offset, offset + 499)
        if (error) throw error
        const rows = data || []
        for (const row of rows) {
          if (!row?.id || row.id === rootId || found.has(row.id)) continue
          found.set(row.id, row)
          next.push(row.id)
          if (found.size >= MAX_NODES) { truncated = true; break }
        }
        if (truncated || rows.length < 500) break
      }
      if (truncated) break
    }
    parents = truncated ? [] : next
  }
  if (parents.length) truncated = true
  return {nodes:[...found.values()], truncated}
}

export default function DescendantBodies({ rootWorkId, treeNodes = [], fontSize = 16, enabled = true, compact = false }) {
  const [remote, setRemote] = useState(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loaded, setLoaded] = useState([])
  const [bodyLoading, setBodyLoading] = useState(false)
  const [bodyError, setBodyError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLimit(PAGE_SIZE)
    setRemote(null)
    setTreeError('')
    setTreeLoading(false)
    if (!enabled || !rootWorkId || !configured) return () => { active = false }
    setTreeLoading(true)
    loadPublicDescendants(rootWorkId).then(data => {
      if (active) setRemote(data)
    }).catch(error => {
      if (active) setTreeError(messageFor(error))
    }).finally(() => {
      if (active) setTreeLoading(false)
    })
    return () => { active = false }
  }, [enabled, rootWorkId, retry])

  const descendants = useMemo(() => {
    if (!enabled || !rootWorkId) return []
    // Use the homepage index while metadata is loading. Once the API returns,
    // prefer its complete, authoritative list of visible descendants.
    const source = !configured ? demoWorks : (remote?.nodes || treeNodes)
    const publicItems = source.filter(w => w?.id && PUBLIC_STATUSES.includes(w.status))
    const parent = treeNodes.find(w => w.id === rootWorkId)
      || demoWorks.find(w => w.id === rootWorkId)
      || {id:rootWorkId,title:'',node_kind:'collection',status:'published'}
    const withoutRoot = publicItems.filter(w => w.id !== rootWorkId)
    return descendantsOf(hierarchyEntries([parent, ...withoutRoot]), rootWorkId)
  }, [rootWorkId, enabled, treeNodes, remote])
  const visible = useMemo(() => readingPageEntries(descendants, limit), [descendants, limit])
  const ids = useMemo(() => visible.map(entry => entry.id), [visible])
  const idsKey = ids.join(',')

  useEffect(() => {
    let active = true
    setLoaded([])
    setBodyError('')
    if (!enabled || !ids.length) {setBodyLoading(false); return () => { active = false }}
    if (!configured) {
      const byId = new Map(demoWorks.filter(w => PUBLIC_STATUSES.includes(w.status)).map(w => [w.id,w]))
      setLoaded(ids.map(id => byId.get(id)).filter(Boolean))
      setBodyLoading(false)
      return () => { active = false }
    }
    setBodyLoading(true)
    ;(async () => {
      try {
        // A separate query avoids downloading 200k-char bodies for every
        // descendant when a large textbook is opened.
        const {data,error} = await supabase.from('works')
          .select('id,body,status')
          .in('id',ids)
          .in('status',PUBLIC_STATUSES)
        if (error) throw error
        if (active) setLoaded(data || [])
      } catch(error) {
        if (active) setBodyError(messageFor(error))
      } finally {
        if (active) setBodyLoading(false)
      }
    })()
    return () => { active = false }
  }, [enabled, idsKey, retry])

  if (!enabled) return null
  if (!descendants.length && !treeLoading && !treeError) return null
  const byId = new Map(loaded.map(item => [item.id,item]))
  const hasBody = loaded.some(item => typeof item.body === 'string' && item.body.trim())
  return <section className={`descendant-reader ${compact ? 'descendant-reader-compact' : ''}`} aria-label="収録された章と節">
    {visible.map(entry => {
      const body = byId.get(entry.id)?.body
      const label = entry.path.split(' › ').filter(Boolean).join(' › ')
      return <article key={entry.id} className={`descendant-reader-item ${entry.node_kind === 'collection' ? 'is-group' : 'is-body'}`}>
        <div className="descendant-reader-title" style={{paddingLeft:Math.min(entry.depth,8)*9}}>
          <span aria-hidden="true">{entry.node_kind === 'collection' ? '▣' : '§'}</span>
          <a href={`/works/${encodeURIComponent(entry.id)}`} title={label}>{label}</a>
        </div>
        {typeof body === 'string' && body.trim() && <RichBody source={body} fontSize={fontSize}/>}
      </article>
    })}
    {(treeLoading || bodyLoading) && <p className="muted" role="status">下位の章・節を読み込んでいます…</p>}
    {treeError && <p className="parallel-error" role="alert">階層目次を取得できませんでした：{treeError}</p>}
    {bodyError && <p className="parallel-error" role="alert">収録作品の文章を取得できませんでした：{bodyError}</p>}
    {(treeError || bodyError) && <button type="button" className="button light small" onClick={() => setRetry(v => v + 1)}>再試行</button>}
    {!treeLoading && !bodyLoading && !treeError && !bodyError && !hasBody && visible.length === descendants.length && <p className="muted" role="status">現在、公開済みの下位本文はありません。</p>}
    {remote?.truncated && <p className="hint">収録作品が非常に多いため、最初の{MAX_NODES}項目を表示しています。</p>}
    {visible.length < descendants.length && <button type="button" className="button light small" onClick={() => setLimit(v => v + PAGE_SIZE)}>続きを読む（次の章・節）</button>}
  </section>
}
