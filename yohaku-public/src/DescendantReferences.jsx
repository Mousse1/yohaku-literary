import {descendantsOf,hierarchyEntries} from './workHierarchy'
import {fileReferenceGroups} from './fileReferenceGroups.js'
import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { configured, publicReader, safeUrl, messageFor } from './client'

// Read-only bibliography grouped by the registering file.
// The per-work limit of 20 registered references is unchanged.
// The database function traverses all *published* descendants recursively; no
// hidden, pending or draft work is exposed to anonymous readers.
const PAGE_SIZE = 400
const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')

export default function DescendantReferences({ workId, enabled = true, rootWork=null, ownReferences=[], ownerWorks=null, onOpen }) {
  const [state, setState] = useState({ rows: [], communityRows: [], nodes:[], loading: false, error: '' })
  useEffect(() => {
    let active = true
    if (ownerWorks || !configured || !enabled || !isUuid(workId)) {
      setState({ rows: [], communityRows: [], nodes:[], loading: false, error: '' })
      return () => { active = false }
    }
    setState({ rows: [], communityRows: [], nodes:[], loading: true, error: '' })
    ;(async () => {
      const all = []
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await publicReader.rpc('list_descendant_references', {
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
        const { data, error } = await publicReader.rpc('list_descendant_community_references', {
          p_work_id: workId
        }).range(offset, offset + PAGE_SIZE - 1)
        if (error) throw error
        if (!active) return
        const chunk = data || []
        community.push(...chunk)
        if (chunk.length < PAGE_SIZE) break
      }
      const nodes=new Map();let ids=[...new Set([workId,...all.map(r=>r.source_work_id)])];
      for(let depth=0;depth<13&&ids.length;depth++){
        const next=new Set();
        for(let i=0;i<ids.length;i+=100){
          const {data,error}=await publicReader.from('works').select('id,title,parent_work_id,node_kind').in('id',ids.slice(i,i+100)).in('status',['open','published']);
          if(error)throw error;if(!active)return;
          for(const w of data||[]){nodes.set(w.id,w);if(w.parent_work_id&&!nodes.has(w.parent_work_id))next.add(w.parent_work_id)}
        }
        ids=[...next].filter(id=>!nodes.has(id));
      }
      if (active) setState({ rows: all, communityRows: community, nodes:[...nodes.values()], loading: false, error: '' })
    })().catch(error => {
      if (active) setState({ rows: [], communityRows: [], nodes:[], loading: false, error: messageFor(error) })
    })
    return () => { active = false }
  }, [workId, enabled,Boolean(ownerWorks)])

  const groups = useMemo(() => {
    if(ownerWorks){
      const descendants=descendantsOf(hierarchyEntries(ownerWorks),workId);
      return fileReferenceGroups([{work:rootWork||{id:workId},references:ownReferences},...descendants.map(w=>({work:w,references:w.work_references||[]}))]);
    }
    const nodes=new Map((state.nodes||[]).map(w=>[w.id,w]));
    nodes.set(workId,{...(nodes.get(workId)||{}),...(rootWork||{id:workId,title:'参考文献'})});
    const records=[{work:nodes.get(workId),references:ownReferences}];const byId=new Map([[workId,records[0]]]);
    for(const row of state.rows){
      if(row.source_work_id===workId)continue;
      if(!byId.has(row.source_work_id)){const r={work:nodes.get(row.source_work_id)||{id:row.source_work_id,title:row.source_path||row.source_title},references:[]};byId.set(row.source_work_id,r);records.push(r)}
      byId.get(row.source_work_id).references.push({title:row.reference_title,url:row.reference_url,relation:row.reference_relation});
    }
    for(const node of nodes.values())if(!byId.has(node.id))records.push({work:node,references:[]});
    return fileReferenceGroups(records);
  }, [state.rows,state.nodes,workId,rootWork,ownReferences,ownerWorks])

  const communityGroups = useMemo(() => {
    const map = new Map()
    for (const r of state.communityRows) {
      if (!map.has(r.source_work_id)) map.set(r.source_work_id, {id:r.source_work_id,path:r.source_path,refs:[]})
      map.get(r.source_work_id).refs.push(r)
    }
    return [...map.values()]
  }, [state.communityRows])

  if (!ownerWorks&&(!enabled || !configured)&&!ownReferences.length) return null
  if (!state.loading && !state.error && !groups.length && !communityGroups.length) return null

  return <section className="inherited-references" aria-label="ファイルごとの参考文献">
    <h3><BookOpen size={16} /> 参考文献・関連作品{groups.length+communityGroups.length > 0 && <small> {groups.reduce((n,g)=>n+g.references.length,0)+state.communityRows.length} 件</small>}</h3>
    <p className="hint">参考文献を登録元のファイルごとにまとめています。</p>
    {state.loading && <p className="muted" role="status">下位作品の文献を読み込んでいます…</p>}
    {state.error && <p className="reference-load-error" role="alert">下位作品の参考文献を表示できません。Supabaseのv6.4追加SQLを確認してください。詳細：{state.error}</p>}
    {groups.map(group => <div className="inherited-reference-group" key={group.id}>
      <h4><a href={`/works/${encodeURIComponent(group.id)}`} title={group.path || group.title} onClick={e=>{if(onOpen){e.preventDefault();onOpen(group.id)}}}>{group.path || group.title} <ArrowUpRight size={12} /></a></h4>
      {group.references.map((r,i) => <div className="reference" key={i}>
        <strong>{r.annotation_number?`*${r.annotation_number}　`:''}{r.title}</strong>
        {r.relation && <span>{r.relation}</span>}
        {safeUrl(r.url) && <a href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">文献のリンク <ArrowUpRight size={12} /></a>}
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
