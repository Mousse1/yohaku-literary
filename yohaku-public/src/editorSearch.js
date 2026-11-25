// Literal, non-overlapping matches; offsets remain native textarea UTF-16 offsets.
export function findBodyMatches(body,query) {
  if(!query)return [];
  const result=[];let from=0;
  while(from<=body.length-query.length){
    const index=body.indexOf(query,from);
    if(index<0)break;
    result.push(index);from=index+query.length;
  }
  return result;
}

export function revealBodyMatch(editor,start,length) {
  if(!editor)return;
  editor.focus({preventScroll:true});
  editor.setSelectionRange(start,start+length);
  // Measure the wrapped text using the editor's actual width and typography.
  const style=getComputedStyle(editor);
  const mirror=document.createElement('div');
  for(const key of ['boxSizing','width','fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','paddingTop','paddingRight','paddingBottom','paddingLeft','wordBreak','overflowWrap','tabSize'])mirror.style[key]=style[key];
  Object.assign(mirror.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',whiteSpace:'pre-wrap',border:'0',width:editor.clientWidth+'px'});
  mirror.textContent=editor.value.slice(0,start);
  const marker=document.createElement('span');marker.textContent=editor.value.slice(start,start+1)||' ';mirror.append(marker);
  document.body.append(mirror);
  const top=marker.getBoundingClientRect().top-mirror.getBoundingClientRect().top;
  mirror.remove();
  editor.scrollTop=Math.max(0,top-editor.clientHeight/3);
  editor.scrollIntoView({block:'nearest',inline:'nearest'});
}
