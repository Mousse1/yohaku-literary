import React, { useEffect, useMemo, useState } from 'react'
import { configured, supabase, demoWorks, messageFor } from './client'
import RichBody from './RichBody'
import { hierarchyEntries, descendantsOf } from './workHierarchy'

// Shared by a single work's page and by the parallel reader. The work itself
// retains its original text; the other works are loaded independently.
const PAGE_SIZE = 6

export default function DescendantBodies({ rootWorkId, treeNodes = [], fontSize = 16, enabled = true, compact = false }) {
  const descendants = useMemo(() => {
    if (!enabled || !rootWorkId) return []
    const published = treeNodes.filter(work => work?.id && work.status === 'published')
    return descendantsOf(hierarchyEntries(published), rootWorkId)
  }, [rootWorkId, treeNodes, enabled])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loaded, setLoaded] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const visible = useMemo(() => descendants.slice(0, limit), [descendants, limit])
  const ids = useMemo(() => visible.map(entry => entry.id), [visible])

  useEffect(() => setLimit(PAGE_SIZE), [rootWorkId])
  useEffect(() => {
    let active = true
    setLoaded([])
    setError('')
    if (!enabled || !ids.length) { setLoading(false); return () => { active = false } }
    if (!configured) {
      const byId = new Map(demoWorks.filter(w => w.status === 'published').map(w => [w.id,w]))
      setLoaded(ids.map(id => byId.get(id)).filter(Boolean))
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    ;(async () => {
      try {
        const { data, error: queryError } = await supabase.from('works')
          .select('id,title,body,node_kind,status')
          .in('id', ids)
          .eq('status', 'published')
        if (!active) return
        if (queryError) throw queryError
        const byId = new Map((data || []).map(item => [item.id,item]))
        setLoaded(ids.map(id => byId.get(id)).filter(Boolean))
      } catch (err) {
        if (active) setError(messageFor(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [enabled, ids, retry])

  if (!enabled || !descendants.length) return null
  const byId = new Map(loaded.map(item => [item.id,item]))
  return <section className={`descendant-reader ${compact ? 'descendant-reader-compact' : ''}`} aria-label="収録された章と節">
    {visible.map(entry => {
      const item = byId.get(entry.id)
      return <article key={entry.id} className="descendant-reader-item">
        <div className="descendant-reader-title" style={{paddingLeft:Math.min(entry.depth,8)*9}}>
          <span aria-hidden="true">{entry.node_kind === 'collection' ? '▣' : '§'}</span>
          <a href={`/works/${encodeURIComponent(entry.id)}`} title={entry.path}>{entry.path}</a>
        </div>
        {item?.body?.trim() && <RichBody source={item.body} fontSize={fontSize}/>}
      </article>
    })}
    {loading && <p className="muted" role="status">収録作品を読み込んでいます…</p>}
    {error && <div className="parallel-error" role="alert">収録作品を表示できませんでした：{error} <button type="button" className="button light small" onClick={() => setRetry(i => i + 1)}>再読み込み</button></div>}
    {limit < descendants.length && <button type="button" className="button light small" onClick={() => setLimit(v => v + PAGE_SIZE)}>さらに{Math.min(PAGE_SIZE,descendants.length - limit)}項目を読む</button>}
  </section>
}
