export const EXPANSION_TTL=24*60*60*1000
const key=userId=>'yohaku:owner-expansion:v1:'+userId
const memory=new Map()
function read(userId,now){
 if(!userId)return {}
 let data=memory.get(userId)||{}
 try{data=JSON.parse(localStorage.getItem(key(userId))||'null')||data}catch{}
 return Object.fromEntries(Object.entries(data).filter(([,v])=>v&&typeof v.open==='boolean'&&Number.isFinite(v.until)&&v.until>now&&v.until<=now+EXPANSION_TTL))
}
export function rememberedExpanded(userId,now=Date.now()){
 return new Set(Object.entries(read(userId,now)).filter(([,v])=>v.open).map(([id])=>id))
}
export function rememberExpansion(userId,ids,open,now=Date.now()){
 if(!userId)return
 const data=read(userId,now)
 for(const id of ids)if(id)data[id]={open,until:now+EXPANSION_TTL}
 memory.set(userId,data)
 try{localStorage.setItem(key(userId),JSON.stringify(data))}catch{}
}
export function rememberEditedPath(userId,work,works=[],now=Date.now()){
 const byId=new Map(works.map(w=>[w.id,w]));byId.set(work.id,work)
 const visited=new Set(),ids=new Set();let current=work
 while(current&&!visited.has(current.id)){
  visited.add(current.id);ids.add(current.id)
  if(current.parent_work_id)ids.add(current.parent_work_id)
  current=byId.get(current.parent_work_id)
 }
 rememberExpansion(userId,[...ids],true,now)
}
