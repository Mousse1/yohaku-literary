import {safePythonPlot,codeFence} from './pythonOutput.js'
const marker='\n\n```yohaku-attachments-v1\n'
export function validAttachment(a){return a&&typeof a.name==='string'&&a.name.length<=120&&typeof a.caption==='string'&&a.caption.length<=1000&&((a.kind==='python'&&typeof a.code==='string'&&a.code.length<=80000)||(a.kind==='image'&&safePythonPlot(a.png)))}
export function splitAttachments(source=''){
 const body=String(source);const at=body.lastIndexOf(marker)
 if(at<0||!body.endsWith('\n```'))return {body,attachments:[]}
 try{const attachments=JSON.parse(body.slice(at+marker.length,-4));if(!Array.isArray(attachments)||attachments.length>10||!attachments.every(validAttachment))throw Error();return {body:body.slice(0,at),attachments}}catch{return {body,attachments:[]}}
}
export function joinAttachments(body,attachments=[]){return attachments.length?body+marker+JSON.stringify(attachments)+'\n```':body}
export function attachmentFields(fields){if(Array.isArray(fields.attachments))return fields;return {...fields,...splitAttachments(fields.body)}}
export function attachmentMarkdown(source,{images=true}={}){
 const {body,attachments}=splitAttachments(source)
 return body+(attachments.length?'\n\n## 添付資料\n\n'+attachments.map((a,i)=>'### 資料'+(i+1)+'：'+a.name.replace(/[\r\n]/g,' ')+'\n\n'+a.caption+'\n\n'+(a.kind==='python'?codeFence(a.code,'python'):images?'![結果の画像](data:image/png;base64,'+a.png+')':'［結果の画像：PDFまたはサイトで閲覧できます］')).join('\n\n'):'')
}
