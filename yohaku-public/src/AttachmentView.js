import React from 'react'
const h=React.createElement
export function AttachmentView({attachments=[]}){
 if(!attachments.length)return null
 return h('section',{className:'work-attachments','aria-label':'添付資料'},h('h3',null,'添付資料'),...attachments.map((a,i)=>h('article',{className:'work-attachment',key:i},h('h4',null,'資料'+(i+1)+'：'+a.name),a.caption&&h('p',null,a.caption),a.kind==='python'?h(React.Fragment,null,h('a',{className:'attachment-download',href:'data:text/plain;charset=utf-8,'+encodeURIComponent(a.code),download:a.name.endsWith('.py')?a.name:a.name+'.py'},'.pyを保存'),h('details',null,h('summary',null,'コードを見る'),h('pre',null,h('code',null,a.code)))):h('img',{src:'data:image/png;base64,'+a.png,alt:a.caption||a.name,className:'python-output-image'}))))
}
export const attachmentCss='.work-attachments{border-top:1px solid #ccc;margin-top:24px;padding-top:12px}.work-attachment{margin:16px 0}.work-attachment h4{margin-bottom:8px}.work-attachment img{max-width:100%;height:auto}.work-attachment pre{white-space:pre-wrap;overflow-wrap:anywhere}.work-attachment p{white-space:pre-wrap}.work-attachment summary{cursor:pointer}.work-attachment .attachment-download{display:inline-block;margin-bottom:8px}@media print{.attachment-download{display:none}}'
