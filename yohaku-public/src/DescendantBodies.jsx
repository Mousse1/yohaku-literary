import React, { useEffect, useMemo, useState } from 'react'
import { configured, supabase, demoWorks, messageFor } from './client'
import RichBody from './RichBody'
import { hierarchyEntries, descendantsOf, readingPageEntries } from './workHierarchy'

// Shared by a single work's page and by the parallel reader. The work itself
// retains its original text; the other works are loaded independently.
const PAGE_SIZE = 6

export default function DescendantBodies({ rootWorkId, treeNodes = [], fontSize = 16, enabled = true, compact = false }) {
  const descendants = useMemo(() => {
    if (!enabled || !rootWorkId) return []
    const published = treeNodes.filter(work => work?.id && ['published','open'].includes(work.status))
    return descendantsOf(hierarchyEntries(published), rootWorkId)
  }, [rootWorkId, treeNodes, enabled])
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [loaded, setLoaded] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const visible = useMemo(() => readingPageEntries(descendants, limit), [descendants, limit])
  const ids = useMemo(() => visible.map(entry => entry.id), [visible])
  const [hasBody, setHasBody] = useState(false)

  useEffect(() => setLimit(PAGE_SIZE), [rootWorkId])
  useEffect(() => {
    let active = true
    setLoaded([])
    setHasBody(false)
    setError('')
    if (!enabled || !ids.length) { setLoading(false); return () => { active = false } }
    if (!configured) {
      const byId = new Map(demoWorks.filter(w => ['published','open'].includes(w.status)).map(w => [w.id,w]))
      const rows = ids.map(id => byId.get(id)).filter(Boolean)
      setLoaded(rows)
      setHasBody(rows.some(item => typeof item.body === 'string' && item.body.trim()))
      setLoading(false)
      return () => { active = false }
    }
    setLoading(true)
    ;(async () => {
      try {
        const { data, error: queryError } = await supabase.from('works')
          .select('id,title,body,node_kind,status')
          .in('id', ids)
          .in('status', ['published','open'])
        if (!active) return
        if (queryError) throw queryError
        const byId = new Map((data || []).map(item => [item.id,item]))
        const rows = ids.map(id => byId.get(id)).filter(Boolean)
        setLoaded(rows)
        setHasBody(rows.some(item => typeof item.body === 'string' && item.body.trim()))
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
      return <article key={entry.id} className={`descendant-reader-item ${entry.node_kind === 'collection' ? 'is-group' : 'is-body'}`}>
        <div className="descendant-reader-title" style={{paddingLeft:Math.min(entry.depth,8)*9}}>
          <span aria-hidden="true">{entry.node_kind === 'collection' ? '▣' : '§'}</span>
          <a href={`/works/${encodeURIComponent(entry.id)}`} title={entry.path}>{entry.path}</a>
        </div>
        {item?.body?.trim() && <RichBody source={item.body} fontSize={fontSize}/>}
      </article>
    })}
    {loading && <p className="muted" role="status">下位の章・節を読み込んでいます…</p>}
    {!loading && !error && !hasBody && visible.length === descendants.length && <p className="muted" role="status">現在、公開済みの下位本文はありません。</p>}
    {error && <div className="parallel-error" role="alert">収録作品を表示できませんでした：{error} <button type="button" className="button light small" onClick={() => setRetry(i => i + 1)}>再読み込み</button></div>}
    {visible.length < descendants.length && <button type="button" className="button light small" onClick={() => setLimit(v => v + PAGE_SIZE)}>続きを読む（次の章・節）</button>}
  </section>
}
