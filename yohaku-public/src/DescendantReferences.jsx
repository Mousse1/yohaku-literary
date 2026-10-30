import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { configured, supabase, safeUrl, messageFor } from './client'

// The bibliography below is a READ-ONLY view.  A group's own references remain
// separate and the per-work limit of 20 registered references is unchanged.
// The database function traverses all *published* descendants recursively; no
// hidden, pending or draft work is exposed to anonymous readers.
const PAGE_SIZE = 400
const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')

export default function DescendantReferences({ workId, enabled = true }) {
  const [state, setState] = useState({ rows: [], loading: false, error: '' })
  useEffect(() => {
    let active = true
    if (!configured || !enabled || !isUuid(workId)) {
      setState({ rows: [], loading: false, error: '' })
      return () => { active = false }
    }
    setState({ rows: [], loading: true, error: '' })
    ;(async () => {
      const all = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.rpc('list_descendant_references', {
          p_work_id: workId
        }).range(offset, offset + PAGE_SIZE - 1)
        if (error) throw error
        if (!active) return
        const chunk = data || []
        all.push(...chunk)
        if (chunk.length < PAGE_SIZE) break
      }
      if (active) setState({ rows: all, loading: false, error: '' })
    })().catch(error => {
      if (active) setState({ rows: [], loading: false, error: messageFor(error) })
    })()
    return () => { active = false }
  }, [workId, enabled])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of state.rows) {
      if (!map.has(r.source_work_id)) {
        map.set(r.source_work_id, { id: r.source_work_id, title: r.source_title,
          path: r.source_path, references: [] })
      }
      map.get(r.source_work_id).references.push(r)
    }
    return [...map.values()]
  }, [state.rows])

  if (!enabled || !configured) return null
  if (!state.loading && !state.error && !groups.length) return null

  return <section className="inherited-references" aria-label="下位作品から集約した参考文献">
    <h3><BookOpen size={16} /> 下位作品の参考文献{state.rows.length > 0 && <small> {state.rows.length} 件</small>}</h3>
    <p className="hint">下位の公開作品に登録された文献を、登録元の作品別に表示しています。各作品の文献上限20件はそのままです。</p>
    {state.loading && <p className="muted" role="status">下位作品の文献を読み込んでいます…</p>}
    {state.error && <p className="reference-load-error" role="alert">下位作品の参考文献を表示できません。Supabaseのv6.4追加SQLを確認してください。詳細：{state.error}</p>}
    {groups.map(group => <div className="inherited-reference-group" key={group.id}>
      <h4><a href={`/works/${encodeURIComponent(group.id)}`} title={group.path || group.title}>{group.path || group.title} <ArrowUpRight size={12} /></a></h4>
      {group.references.map(r => <div className="reference" key={r.reference_id}>
        <strong>{r.reference_title}</strong>
        {r.reference_relation && <span>{r.reference_relation}</span>}
        {safeUrl(r.reference_url) && <a href={safeUrl(r.reference_url)} target="_blank" rel="noopener noreferrer">文献のリンク <ArrowUpRight size={12} /></a>}
      </div>)}
    </div>)}
  </section>
}
