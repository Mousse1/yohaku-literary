// Lean Web documents #code as a plain-text, URL-encoded fragment argument.
// Only explicit navigation sends the code to the external execution service.
export const LEAN_WEB='https://live.lean-lang.org/';
export function leanEditorLink(code){
 const fragment='code='+encodeURIComponent(String(code??''));
 return fragment.length<=16000?{url:LEAN_WEB+'#'+fragment,includesCode:true}:{url:LEAN_WEB,includesCode:false};
}
