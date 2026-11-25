import {renderPrintMarkdown} from '../worker/printMarkdown.js'
// Shared renderer keeps Markdown, mathematics and annotation rules identical to reading.
// Manuscript stays in this browser; no external processing service is used.
window.yohakuPrintReady=(async()=>{
 const source=document.getElementById('print-source');
 const status=document.getElementById('pagination-status');
 const included=new Set([...source.querySelectorAll('.export-record-header>span[id^="work-"]')].map(node=>node.id.slice(5)));
 const blocks=[...source.querySelectorAll('template[data-print-markdown]')];
 for(let i=0;i<blocks.length;i++){
  const template=blocks[i];const data=JSON.parse(template.content.textContent);
  const html=renderPrintMarkdown(data.source,{work:data.work,origin:data.origin,included});
  const replacement=document.createElement('template');replacement.innerHTML=html;
  template.replaceWith(replacement.content);
  if(status)status.textContent='本文を準備しています… '+(i+1)+' / '+blocks.length;
  await new Promise(resolve=>setTimeout(resolve,0));
 }
})();
