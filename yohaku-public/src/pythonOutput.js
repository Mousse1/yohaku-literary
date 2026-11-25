export const PYTHON_CODE_LIMIT=80000;
export function safePythonPlot(value) {
  if(typeof value!=='string'||value.length>180000||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value))return false;
  try{
    const bytes=atob(value.slice(0,44));
    const uint=i=>((bytes.charCodeAt(i)*16777216)+(bytes.charCodeAt(i+1)<<16)+(bytes.charCodeAt(i+2)<<8)+bytes.charCodeAt(i+3));
    const w=uint(16),h=uint(20);
    return bytes.slice(12,16)==='IHDR'&&w>0&&h>0&&w<=4096&&h<=4096&&w*h<=4000000;
  }catch{return false}
}
export function codeFence(text,language='text'){
 const longest=Math.max(2,...(String(text).match(/`+/g)||[]).map(x=>x.length));
 const fence='`'.repeat(longest+1);
 return fence+language+'\n'+text+'\n'+fence;
}
export function pythonPublication(code,result,{includeCode=true,includeResult=true}={}){
 const blocks=[];
 if(includeCode)blocks.push(codeFence(code,'python'));
 if(includeResult&&result){
  blocks.push('### Python実行結果');
  if(result.text)blocks.push(codeFence(result.text));
  for(const plot of result.plots||[])if(safePythonPlot(plot))blocks.push(codeFence(plot,'yohaku-python-plot'));
  if(!result.text&&!result.plots?.length)blocks.push('（出力なし）');
 }
 return '\n\n'+blocks.join('\n\n')+'\n\n';
}
