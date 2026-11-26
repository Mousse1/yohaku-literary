// Author reads use an explicit owner constraint as well as database RLS.
export async function loadReadableWork(id,userId,ownerClient,anonymousClient){
 if(userId){
  const result=await ownerClient.from('works').select('*,work_references(*)').eq('id',id).eq('author_id',userId).maybeSingle();
  if(result.error)throw result.error;
  if(result.data)return result.data;
 }
 const result=await anonymousClient.from('works').select('*,work_references(*)').eq('id',id).in('status',['published','open']).maybeSingle();
 if(result.error)throw result.error;
 return result.data;
}
export const ownedWorks=(works,userId)=>userId?(works||[]).filter(w=>w.author_id===userId):[];
