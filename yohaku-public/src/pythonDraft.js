export const defaultPythonCode='print("こんにちは、余白")';
export function readPythonDraft(key){
 try{if(!key)return null;const d=JSON.parse(localStorage.getItem(key));return d&&typeof d.code==='string'&&d.code.length<=80000&&typeof d.name==='string'?{code:d.code,name:d.name.slice(0,120)}:null}catch{return null}
}
export function writePythonDraft(key,code,name){
 try{if(!key)return false;localStorage.setItem(key,JSON.stringify({code,name,savedAt:Date.now()}));return true}catch{return false}
}
