export function executePython(code,onMessage){
 const iframe=document.createElement('iframe');iframe.hidden=true;iframe.setAttribute('sandbox','allow-scripts');iframe.referrerPolicy='no-referrer';iframe.src='/python-runner';iframe.title='Python実行環境';
 const channel=new MessageChannel();let finished=false;
 const cleanup=()=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.postMessage({type:'stop'});channel.port1.close();iframe.remove()};
 const timer=setTimeout(()=>{onMessage({type:'error',text:'Python環境から応答がありません。再度お試しください。'});cleanup()},130000);
 channel.port1.onmessage=event=>{
  if(finished)return;const data=event.data;
  if(data?.type==='ready'){channel.port1.postMessage({type:'run',code});return}
  if(!['status','running','done','error'].includes(data?.type))return;
  onMessage(data);
  if(data.type==='done'||data.type==='error')cleanup();
 };
 iframe.onload=()=>iframe.contentWindow?.postMessage({type:'python-init'},'*',[channel.port2]);
 document.body.append(iframe);
 return cleanup;
}
