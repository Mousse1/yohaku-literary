// Uses only records already authorized by the share capability. No new data requests.
export function installShareParallel(reader,renderBody){
 const originals=[...reader.querySelectorAll('[data-share-work]')];
 const sources=new Map(originals.map(n=>[n.dataset.shareWork,n.cloneNode(true)]));
 const titles=new Map([...reader.querySelectorAll('.reader-toc a')].map(a=>[decodeURIComponent(a.hash.slice(6)),a.textContent]));
 const container=document.createElement('section');container.className='share-parallel';container.hidden=true;container.setAttribute('aria-label','並べて読む');
 const actions=document.createElement('div');actions.className='reader-actions';
 const add=document.createElement('button');add.type='button';add.textContent='パネルを追加';actions.append(add);
 const panels=document.createElement('div');panels.className='share-parallel-panels';container.append(actions,panels);
 reader.append(container);let serial=0;
 const button=document.getElementById('reader-parallel');
 const select=(label,options)=>{const wrap=document.createElement('label');wrap.textContent=label+' ';const el=document.createElement('select');el.setAttribute('aria-label',label);for(const [value,text]of options){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o)}wrap.append(el);return {wrap,el}};
 function addPanel(id=originals[0]?.dataset.shareWork,kind='body',focus=''){
  if(panels.children.length>=4)return null;
  const pane=document.createElement('section');pane.className='share-pane';const prefix='parallel-'+(++serial)+'-';
  const picker=select('作品',titles);picker.el.value=id;
  const mode=select('表示',[['body','本文・添付資料'],['refs','参考文献・関連作品'],['notes','注釈・異論']]);mode.el.value=kind;
  const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.setAttribute('aria-label','このパネルを閉じる');
  const settings=document.createElement('div');settings.className='share-pane-settings';settings.append(picker.wrap,mode.wrap,close);
  const content=document.createElement('div');content.className='share-pane-content';content.tabIndex=0;
  pane.append(settings,content);panels.append(pane);add.disabled=panels.children.length>=4;
  close.onclick=()=>{pane.remove();add.disabled=false;if(!panels.children.length)addPanel()};
  function show(target=''){
   content.replaceChildren();const id=picker.el.value;const source=sources.get(id);if(!source)return;
   const title=document.createElement('h2');title.textContent=titles.get(id)||'本文';content.append(title);
   const clone=source.cloneNode(true);
   if(mode.el.value==='body'){
    for(const node of clone.querySelectorAll(':scope > details[data-reader-body],:scope > .reader-context')){content.append(node);if(node.matches('[data-reader-body]')){node.open=true;renderBody(node)}}
    // A group can choose its contents without opening a separate share URL.
    const start=originals.findIndex(n=>n.dataset.shareWork===id),depth=Number(source.dataset.depth);
    const children=originals.slice(start+1).filter((n,i,arr)=>!arr.slice(0,i+1).some(x=>Number(x.dataset.depth)<=depth));
    if(children.length){const list=document.createElement('div');for(const child of children){const b=document.createElement('button');b.type='button';b.textContent=titles.get(child.dataset.shareWork)||'本文';b.onclick=()=>{picker.el.value=child.dataset.shareWork;show()};list.append(b)}content.append(list)}
   }else if(mode.el.value==='refs'){
    const found=[];
    for(const record of sources.values())for(const li of record.querySelectorAll('.reader-references li')){
     if(record===source||[...li.querySelectorAll('[id]')].some(n=>n.id.startsWith('ref-'+id+'-')))found.push(li.cloneNode(true));
    }
    const list=document.createElement('ul');list.append(...found);content.append(list);
   }else{
    for(const n of clone.querySelectorAll('.reader-note'))content.append(n);
   }
   if(content.children.length===1||(content.children.length===2&&content.lastChild.tagName==='UL'&&!content.lastChild.children.length)){const empty=document.createElement('p');empty.textContent='この項目には登録されていません。';content.append(empty)}
   for(const n of content.querySelectorAll('[id]'))n.id=prefix+n.id;
   for(const link of content.querySelectorAll('a[href^="#"]'))link.dataset.originalTarget=decodeURIComponent(link.hash.slice(1));
   content.scrollTop=0;
   if(target){const n=[...content.querySelectorAll('[id]')].find(n=>n.id===prefix+target);n?.scrollIntoView({block:'nearest'})}
  }
  pane.show=(id,kind,target='')=>{picker.el.value=id;mode.el.value=kind;show(target)};
  picker.el.onchange=()=>show();mode.el.onchange=()=>show();
  content.addEventListener('click',event=>{
   const a=event.target.closest('a[data-original-target]');if(!a)return;
   const target=a.dataset.originalTarget;
   const local=[...content.querySelectorAll('[id]')].find(n=>n.id===prefix+target);
   if(local){event.preventDefault();local.scrollIntoView({block:'nearest'});return}
   let destination,kind;
   for(const id of sources.keys())if(target.startsWith('ref-'+id+'-')){destination=id;kind='refs';break}
   if(!destination)for(const id of sources.keys())if(target==='work-'+id||target.startsWith(id+'-')){destination=id;kind='body';break}
   if(!destination)return;
   event.preventDefault();let other=[...panels.children].find(n=>n!==pane);
   if(!other)other=addPanel(destination,kind,target);else other.show(destination,kind,target);
  });
  show(focus);return pane;
 }
 add.onclick=()=>addPanel();
 button.onclick=()=>{
  const opening=container.hidden;container.hidden=!opening;button.textContent=opening?'単独表示に戻す':'並べて読む';button.setAttribute('aria-pressed',String(opening));reader.classList.toggle('parallel-active',opening);
  for(const n of originals)n.hidden=opening;
  reader.querySelector('.reader-toc').hidden=opening;
  if(opening&&!panels.children.length){addPanel();addPanel(originals[0]?.dataset.shareWork,'refs')}
 };
}
