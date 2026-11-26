import {installShareParallel} from './shareParallel.js'
import {renderPrintMarkdown} from '../worker/printMarkdown.js'
const reader=document.getElementById('share-reader');
if(reader){
 const included=new Set([...reader.querySelectorAll('[data-share-work]')].map(n=>n.dataset.shareWork));
 const status=document.getElementById('reader-status');
 function render(details){
  const template=details.querySelector('template[data-reader-markdown]');if(!template)return;
  try{
   const data=JSON.parse(template.content.textContent);
   const fragment=document.createElement('template');fragment.innerHTML=renderPrintMarkdown(data.source,{work:data.work,origin:data.origin,included});
   template.replaceWith(fragment.content);status.textContent='';
  }catch{status.textContent='本文を表示できませんでした。再読み込みするか、テキストを保存してください。'}
 }
 reader.addEventListener('toggle',event=>{if(event.target.matches('details[data-reader-body]')&&event.target.open)render(event.target)},true);
 reader.querySelectorAll('details[data-reader-body][open]').forEach(render);
 function revealHash(){
  let id;try{id=decodeURIComponent(location.hash.slice(1))}catch{return}if(!id)return;
  let target=document.getElementById(id);
  if(!target){
   const record=[...reader.querySelectorAll('[data-share-work]')].find(r=>id.startsWith(r.dataset.shareWork+'-'));
   const details=record?.querySelector('details[data-reader-body]');if(details){details.open=true;render(details);target=document.getElementById(id)}
  }
  if(!target)return;
  const body=target.matches('[data-share-work]')?target.querySelector('details[data-reader-body]'):target.closest('details[data-reader-body]');
  if(body){body.open=true;render(body)}
  requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
 }
 window.addEventListener('hashchange',revealHash);revealHash();
 reader.addEventListener('click',event=>{
  const link=event.target.closest('a[href^="#"]');if(link&&link.hash===location.hash)revealHash();
 });
 installShareParallel(reader,render);
 const size=document.getElementById('reader-size');
 const applySize=()=>{reader.style.setProperty('--reader-size',size.value+'px');try{localStorage.setItem('yohaku:share-reader-size',size.value)}catch{}};
 try{const saved=localStorage.getItem('yohaku:share-reader-size');if(['14','16','18','20','24'].includes(saved))size.value=saved}catch{}
 applySize();size.addEventListener('change',applySize);
 document.getElementById('reader-width').addEventListener('click',event=>{const wide=reader.classList.toggle('wide');event.currentTarget.textContent=wide?'標準の幅に戻す':'横に広げる';event.currentTarget.setAttribute('aria-pressed',String(wide))});
}
