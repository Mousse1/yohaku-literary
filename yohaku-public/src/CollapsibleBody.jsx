import React, { useState } from 'react'

// Mount the reader only after the user opens it, including descendant fetches.
export default function CollapsibleBody({children, label='本文', className=''}) {
  const [open,setOpen]=useState(false)
  return <details className={`collapsible-body ${className}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>{label}<span className="body-toggle-hint">{open?'クリックで閉じる':'クリックで開く'}</span></summary>
    {open && <div className="collapsible-body-content">{children}</div>}
  </details>
}
