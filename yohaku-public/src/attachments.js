import {safePythonPlot,codeFence} from './pythonOutput.js'
const marker='\n\n```yohaku-attachments-v1\n'
export function validAttachment(a){return a&&typeof a.name==='string'&&a.name.length<=120&&typeof a.caption==='string'&&a.caption.length<=1000&&(a.leanVersion===undefined||(typeof a.leanVersion==='string'&&a.leanVersion.length<=120))&&(a.leanDependencies===undefined||(typeof a.leanDependencies==='string'&&a.leanDependencies.length<=1000))&&((a.kind==='python'&&typeof a.code==='string'&&a.code.length<=80000)||(a.kind==='text'&&['json','csv','txt','lean'].includes(a.format)&&typeof a.text==='string'&&a.text.length<=80000)||(a.kind==='image'&&safePythonPlot(a.png)))}
export function splitAttachments(source=''){
 const body=String(source);const at=body.lastIndexOf(marker)
 if(at<0||!body.endsWith('\n```'))return {body,attachments:[]}
 try{const attachments=JSON.parse(body.slice(at+marker.length,-4));if(!Array.isArray(attachments)||attachments.length>10||!attachments.every(validAttachment))throw Error();return {body:body.slice(0,at),attachments}}catch{return {body,attachments:[]}}
}
export function joinAttachments(body,attachments=[]){return attachments.length?body+marker+JSON.stringify(attachments)+'\n```':body}
export function attachmentFields(fields){if(Array.isArray(fields.attachments))return fields;return {...fields,...splitAttachments(fields.body)}}
export function attachmentMarkdown(source,{images=true}={}){
 const {body,attachments}=splitAttachments(source)
 return body+(attachments.length?'\n\n## 添付資料\n\n'+attachments.map((a,i)=>'### 資料'+(i+1)+'：'+a.name.replace(/[\r\n]/g,' ')+'\n\n'+a.caption+'\n\n'+(a.format==='lean'?[(a.leanVersion?'Lean: '+a.leanVersion:''),(a.leanDependencies?'依存ライブラリ: '+a.leanDependencies:'')].filter(Boolean).join('\n')+'\n\n':'')+(a.kind==='python'?codeFence(a.code,'python'):a.kind==='text'?codeFence(a.text,a.format):images?'![結果の画像](data:image/png;base64,'+a.png+')':'［結果の画像：PDFまたはサイトで閲覧できます］')).join('\n\n'):'')
}

export async function readAttachmentFile(file){
 const format=String(file.name).split('.').pop().toLowerCase()
 if(!['py','json','csv','txt','lean'].includes(format))throw Error('.py・.lean・.json・.csv・.txtに対応しています。')
 if(file.size>320000)throw Error('ファイルは8万文字以内にしてください。')
 let text
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())}catch{throw Error('UTF-8で保存したファイルを選んでください。')}
 if(text.length>80000)throw Error('ファイルは8万文字以内にしてください。')
 if(format==='json'){try{JSON.parse(text)}catch{throw Error('JSONの形式が正しくありません。内容を確認してください。')}}
 return {kind:format==='py'?'python':'text',name:file.name.slice(0,120),caption:'',...(format==='py'?{code:text}:{format,text})}
}
