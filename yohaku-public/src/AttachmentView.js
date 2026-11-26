import {leanEditorLink} from './leanAttachments.js'
import React from 'react'
const h=React.createElement
export function AttachmentView({attachments=[]}){
 if(!attachments.length)return null
 return h('section',{className:'work-attachments','aria-label':'添付資料'},h('h3',null,'添付資料'),...attachments.map((a,i)=>h('article',{className:'work-attachment',key:i},h('h4',null,'資料'+(i+1)+'：'+a.name),a.caption&&h('p',null,a.caption),a.format==='lean'&&h(LeanAttachmentTools,{attachment:a}),a.kind!=='image'?h(React.Fragment,null,h('a',{className:'attachment-download',href:'data:text/plain;charset=utf-8,'+encodeURIComponent(a.kind==='python'?a.code:a.text),download:a.name.toLowerCase().endsWith('.'+(a.kind==='python'?'py':a.format))?a.name:a.name+'.'+(a.kind==='python'?'py':a.format)},'ファイルを保存'),h('details',null,h('summary',null,'ファイルを開く'),h('pre',null,h('code',null,a.kind==='python'?a.code:a.text)))):h('img',{src:'data:image/png;base64,'+a.png,alt:a.caption||a.name,className:'python-output-image'}))))
}
export const attachmentCss='.work-attachments{border-top:1px solid #ccc;margin-top:24px;padding-top:12px}.work-attachment{margin:16px 0}.work-attachment h4{margin-bottom:8px}.work-attachment img{max-width:100%;height:auto}.work-attachment pre{white-space:pre-wrap;overflow-wrap:anywhere}.work-attachment p{white-space:pre-wrap}.work-attachment summary{cursor:pointer}.work-attachment .attachment-download{display:inline-block;margin-bottom:8px}.lean-attachment-tools{margin:8px 0;padding:10px;border-left:2px solid #c5b9a7}.lean-attachment-tools .hint{font-size:12px}.lean-editor-link{margin-right:12px}@media print{.attachment-download,.lean-attachment-tools{display:none}}'

export function LeanAttachmentTools({attachment:a}){
 const link=leanEditorLink(a.text);
 return h('div',{className:'lean-attachment-tools'},
  (a.leanVersion||a.leanDependencies)&&h('p',null,[a.leanVersion?'Lean: '+a.leanVersion:'',a.leanDependencies?'依存ライブラリ: '+a.leanDependencies:''].filter(Boolean).join(' ／ ')),
  h('a',{href:link.url,target:'_blank',rel:'noopener noreferrer',referrerPolicy:'no-referrer',className:'attachment-download lean-editor-link'},link.includesCode?'Lean Webで検査（外部）':'Lean Webを開く（外部）'),
  h('p',{className:'hint'},link.includesCode?'このリンクを押すと、添付コードを外部のLean Webへ渡します。検査結果は外部画面で確認してください。':'コードが長いため自動転送しません。「ファイルを開く」でコード全体をコピーし、Lean Webへ貼り付けて検査してください。'),
  h('p',{className:'hint'},'必要に応じて外部エディターでLean・Mathlib等の環境を選択してください。添付しただけでは検査済みにはなりません。'));
}
