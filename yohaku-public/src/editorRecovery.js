// Local-only editorial undo/recovery. No published work is changed by these helpers.
export const EDITOR_HISTORY_LIMIT = 24
export const editorSafetyKey = (cacheKey) => `${cacheKey}:before-deletion`

export function editorSnapshot(fields, refs, changeNote='') {
  return {fields:{...fields}, refs:refs.map(ref=>({...ref})), changeNote}
}
export const snapshotEquals = (a,b) => JSON.stringify(a) === JSON.stringify(b)

export function changeKind(before,after) {
  if (before.changeNote!==after.changeNote) return 'changeNote'
  if (!snapshotEquals(before.refs,after.refs)) return 'refs'
  const keys=new Set([...Object.keys(before.fields),...Object.keys(after.fields)])
  const changed=[...keys].filter(key=>before.fields[key]!==after.fields[key])
  return changed.length===1 ? `fields.${changed[0]}` : 'multiple'
}

export function isLargeDeletion(before,after) {
  const oldBody=String(before?.fields?.body||'')
  const newBody=String(after?.fields?.body||'')
  return oldBody.length>=40 && newBody.length<oldBody.length && oldBody.length-newBody.length>=Math.max(30,oldBody.length*.3)
}

// Group adjacent keystrokes in the same field into one undo step. Large deletions
// always form their own step so Ctrl+A -> Delete can be undone immediately.
export function recordEdit(history,previous,next,now=Date.now()) {
  if(snapshotEquals(previous,next))return history
  const kind=changeKind(previous,next)
  const merge=kind===history.lastKind && now-history.lastAt<850 && !isLargeDeletion(previous,next) && history.past.length>0
  return {
    past:merge?history.past:[...history.past,previous].slice(-EDITOR_HISTORY_LIMIT),
    future:[],lastKind:kind,lastAt:now,
  }
}

export function undoEdit(history,current) {
  if(!history.past.length)return null
  const past=[...history.past], snapshot=past.pop()
  return {snapshot,history:{past,future:[...history.future,current].slice(-EDITOR_HISTORY_LIMIT),lastKind:null,lastAt:0}}
}
export function redoEdit(history,current) {
  if(!history.future.length)return null
  const future=[...history.future], snapshot=future.pop()
  return {snapshot,history:{past:[...history.past,current].slice(-EDITOR_HISTORY_LIMIT),future,lastKind:null,lastAt:0}}
}

export function readSafetySnapshot(key) {
  try {
    const value=JSON.parse(localStorage.getItem(key)||'null')
    return value?.snapshot?.fields && Array.isArray(value.snapshot.refs) ? value.snapshot : null
  } catch {return null}
}
export function storeSafetySnapshot(key,snapshot) {
  try {localStorage.setItem(key,JSON.stringify({snapshot,savedAt:Date.now()}));return true}
  catch {return false}
}
