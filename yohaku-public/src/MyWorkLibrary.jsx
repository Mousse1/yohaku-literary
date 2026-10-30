import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderTree, FileText, Plus, Clock, FileClock, Link as LinkIcon } from 'lucide-react'
import { categoryOf, displayGenre, dateFmt } from './client'
import { organizeOwnerWorks } from './ownerLibrary.js'

const statusText = { draft:'下書き', pending:'審査待ち', published:'審査済み公開', open:'自由公開（未審査）', rejected:'差し戻し', hidden:'非公開' }
const actionText = { hide:'公開停止', delete:'削除' }
const publicStatus = status => ['published','open'].includes(status)

export default function MyWorkLibrary({
  works = [], revisions = [], requests = [], busy = false,
  onRead, onCreateChild, onEdit, onDelete, onRevise, onRequest, onCancelRequest,
}) {
  const roots = useMemo(() => organizeOwnerWorks(works), [works])
  const [collapsed, setCollapsed] = useState(() => new Set())
  const revisionByWork = useMemo(() => new Map(revisions.map(revision => [revision.work_id, revision])), [revisions])
  const requestsByWork = useMemo(() => {
    const map = new Map()
    for (const request of requests) {
      const all = map.get(request.work_id) || []
      all.push(request)
      map.set(request.work_id, all)
    }
    return map
  }, [requests])
  const toggle = id => setCollapsed(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const setAllCollapsed = close => {
    if (!close) { setCollapsed(new Set()); return }
    const ids = new Set()
    function collect(node) {
      if (node.children.length) ids.add(node.work.id)
      node.children.forEach(collect)
    }
    roots.forEach(collect)
    setCollapsed(ids)
  }
  function renderNode(node) {
    const w = node.work
    const isGroup = w.node_kind === 'collection'
    const hasChildren = node.children.length > 0
    const expanded = !collapsed.has(w.id)
    const revision = revisionByWork.get(w.id)
    const workRequests = requestsByWork.get(w.id) || []
    const activeRequest = workRequests.find(request => request.status === 'pending')
    const rejectedRequest = workRequests.find(request => request.status === 'rejected')
    return <li key={w.id} className={'owner-tree-node' + (isGroup ? ' is-group' : '')}>
      <div className={'owner-work-row' + (isGroup ? ' owner-group-row' : '')}>
        <div className="owner-work-heading">
          {hasChildren
            ? <button type="button" className="owner-toggle" aria-label={`${w.title}の下位作品を${expanded ? '閉じる' : '開く'}`} aria-expanded={expanded} onClick={() => toggle(w.id)}>{expanded ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button>
            : <span className="owner-toggle-spacer" aria-hidden="true"/>}
          {isGroup ? <FolderTree size={18} className="owner-work-type-icon" aria-hidden="true"/> : <FileText size={17} className="owner-work-type-icon" aria-hidden="true"/>}
          <button className="owner-work-title" onClick={() => onRead(w)} title={node.path}>{w.title}</button>
          <span className={'status'+(w.status==='published'?' published':'')}>{statusText[w.status] || w.status}</span>
          {isGroup&&<span className="owner-mini-tag">グループ</span>}
          {hasChildren&&<span className="owner-child-count">下位 {node.descendantCount} 件</span>}
          {!node.depth&&<span className="owner-mini-tag">最上位</span>}
        </div>
        <div className="owner-work-details">
          <span>作者：{w.pen_name}{w.contributor_credit ? ` · 入力／構成：${w.contributor_credit}` : ''}</span>
          <span>{categoryOf(w)} / {displayGenre(w.genre)}</span>
          <span>{dateFmt(w.created_at)}</span>
          {w.current_version>0&&<span>第{w.current_version}版</span>}
          {node.missingParent&&<span className="owner-missing">上位作品がこの一覧にありません</span>}
        </div>
        {revision&&<p className="owner-notice"><FileClock size={14}/> 改訂案：{statusText[revision.status]||revision.status}{revision.review_note&&` — ${revision.review_note}`}</p>}
        {activeRequest&&<p className="owner-notice"><Clock size={14}/> {actionText[activeRequest.action]}申請：審査待ち <button className="text-action" disabled={busy} onClick={()=>onCancelRequest(activeRequest)}>取り消す</button></p>}
        {!activeRequest&&rejectedRequest&&<p className="owner-notice">{actionText[rejectedRequest.action]}申請は却下されました。{rejectedRequest.review_note}</p>}
        <div className="owner-work-actions">
          <button className="text-action" onClick={() => onRead(w)}>読む・履歴</button>
          <button className="text-action" onClick={() => onCreateChild(w,'collection')}><FolderTree size={14}/> 下位グループ</button>
          <button className="text-action" onClick={() => onCreateChild(w,'work')}><Plus size={14}/> 本文を追加</button>
          {publicStatus(w.status)&&<a className="text-action" href={`${window.location.origin}/works/${encodeURIComponent(w.id)}`}><LinkIcon size={13}/> 公開URL</a>}
          {['draft','pending','rejected','open'].includes(w.status)&&<>
            <button className="text-action" onClick={()=>onEdit(w)}>編集</button>
            <button className="text-action dangerous" disabled={busy} onClick={()=>onDelete(w)}>削除</button>
          </>}
          {w.status==='published'&&<>
            <button className="text-action" onClick={()=>onRevise(w)}>{revision?'改訂案を編集':'改訂版を書く'}</button>
            {!activeRequest&&<>
              <button className="text-action" disabled={busy} onClick={()=>onRequest(w,'hide')}>公開停止を申請</button>
              <button className="text-action dangerous" disabled={busy} onClick={()=>onRequest(w,'delete')}>削除を申請</button>
            </>}
          </>}
          {w.status==='hidden'&&!activeRequest&&<button className="text-action dangerous" disabled={busy} onClick={()=>onRequest(w,'delete')}>削除を申請</button>}
        </div>
      </div>
      {hasChildren&&expanded&&<ul className="owner-tree-children">{node.children.map(renderNode)}</ul>}
    </li>
  }
  return <section className="owner-library" aria-label="自分の作品の階層一覧">
    <div className="owner-library-tools">
      <p>グループを開閉すると、そこに収録されている作品が表示されます。作品名から本文を開けます。</p>
      <div className="owner-library-tool-buttons">
        <button className="button light small" onClick={()=>setAllCollapsed(false)}>すべて展開</button>
        <button className="button light small" onClick={()=>setAllCollapsed(true)}>すべて折りたたむ</button>
      </div>
    </div>
    <ul className="owner-tree-root">{roots.map(renderNode)}</ul>
  </section>
}
