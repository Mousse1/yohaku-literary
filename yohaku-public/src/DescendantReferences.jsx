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
  const [state, setState] = useState({ rows: [], communityRows: [], loading: false, error: '' })
  useEffect(() => {
    let active = true
    if (!configured || !enabled || !isUuid(workId)) {
      setState({ rows: [], communityRows: [], loading: false, error: '' })
      return () => { active = false }
    }
    setState({ rows: [], communityRows: [], loading: true, error: '' })
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
      // Approved reader-supplied references, kept separate from author references.
      const community = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase.rpc('list_descendant_community_references', {
          p_work_id: workId
        }).range(offset, offset + PAGE_SIZE - 1)
        if (error) throw error
        if (!active) return
        const chunk = data || []
        community.push(...chunk)
        if (chunk.length < PAGE_SIZE) break
      }
      if (active) setState({ rows: all, communityRows: community, loading: false, error: '' })
    })().catch(error => {
      if (active) setState({ rows: [], communityRows: [], loading: false, error: messageFor(error) })
    })
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

  const communityGroups = useMemo(() => {
    const map = new Map()
    for (const r of state.communityRows) {
      if (!map.has(r.source_work_id)) map.set(r.source_work_id, {id:r.source_work_id,path:r.source_path,refs:[]})
      map.get(r.source_work_id).refs.push(r)
    }
    return [...map.values()]
  }, [state.communityRows])

  if (!enabled || !configured) return null
  if (!state.loading && !state.error && !groups.length && !communityGroups.length) return null

  return <section className="inherited-references" aria-label="下位作品から集約した参考文献">
    <h3><BookOpen size={16} /> 下位作品の参考文献{state.rows.length+state.communityRows.length > 0 && <small> {state.rows.length+state.communityRows.length} 件</small>}</h3>
    <p className="hint">下位の公開作品に登録された文献と、審査承認済みの読者による提案を登録元別に表示します。作者の登録上限20件は変わりません。</p>
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
    {communityGroups.length>0 && <h3 className="inherited-community-title">読者から提案された下位作品の文献・解説</h3>}
    {communityGroups.map(group=><div className="inherited-reference-group" key={`community-${group.id}`}>
      <h4><a href={`/works/${encodeURIComponent(group.id)}`}>{group.path} <ArrowUpRight size={12}/></a></h4>
      {group.refs.map(r=><div className="reference" key={r.reference_id}>
        <strong>{r.reference_title}</strong><span>提案者：{r.contributor_pen_name}</span>
        {r.reference_explanation&&<p className="community-inherited-explanation">{r.reference_explanation}</p>}
        {safeUrl(r.reference_url)&&<a href={safeUrl(r.reference_url)} target="_blank" rel="noopener noreferrer">出典を開く <ArrowUpRight size={12}/></a>}
      </div>)}
    </div>)}
  </section>
}
