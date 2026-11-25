import {unpackReference} from './referenceAnnotations.js'
// Group by the file where a reference was registered; inherited copies only add anchors.
export function fileReferenceGroups(records=[]){
 const index=new Map(),parents=[];
 for(const record of records){
  const w={...record.work};const depth=Number(record.depth)||0;
  if(!w.parent_work_id&&depth>0)w.parent_work_id=parents[depth-1];
  parents[depth]=w.id;parents.length=depth+1;index.set(w.id,w);
 }
 const fileFor=id=>{
  let w=index.get(id),fallback=w;const seen=new Set();
  while(w&&!seen.has(w.id)){
   seen.add(w.id);if(w.node_kind==='collection')return w;
   fallback=w;w=index.get(w.parent_work_id);
  }
  return fallback||records[0]?.work;
 };
 const groups=new Map();
 for(const record of records){
  for(const raw of record.references||[]){
   const ref=unpackReference(raw);const file=fileFor(index.has(raw.source_work_id)?raw.source_work_id:raw.source_work_id?records[0]?.work.id:record.work.id);
   if(!file)continue;
   if(!groups.has(file.id))groups.set(file.id,{id:file.id,title:file.title||'参考文献',references:[],keys:new Map()});
   const group=groups.get(file.id);const number=ref.annotationNumber;
   const key=JSON.stringify([number,ref.title.trim(),String(ref.relation||'').trim(),String(ref.url||'').trim()]);
   if(!group.keys.has(key)){const row={...ref,annotation_number:number?Number(number):null,_aliases:[]};group.keys.set(key,row);group.references.push(row)}
   const row=group.keys.get(key);
   if(number){const alias='ref-'+record.work.id+'-'+number;if(!row._aliases.includes(alias))row._aliases.push(alias)}
  }
 }
 return [...groups.values()].map(({keys,...g})=>({...g,references:g.references.sort((a,b)=>(a.annotation_number||Infinity)-(b.annotation_number||Infinity))}));
}
