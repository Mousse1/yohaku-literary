// Runs in an opaque-origin iframe. Keep submitted code in postMessage data.
const workerSource=String.raw`const CDN='https://cdn.jsdelivr.net/pyodide/v314.0.8/full/';
self.onmessage=async({data})=>{
 let text='';
 const append=value=>{if(text.length<50000)text+=(String(value)+'\n').slice(0,50000-text.length)};
 try{
  postMessage({type:'status',text:'Python環境を準備しています…'});
  importScripts(CDN+'pyodide.js');
  const py=await loadPyodide({indexURL:CDN,stdout:append,stderr:append,stdin:()=>{throw Error('input()には対応していません。値をコード内で指定してください。')}});
  postMessage({type:'status',text:'必要なライブラリを読み込んでいます…'});
  await py.loadPackagesFromImports(data.code);
  // Always use a non-interactive backend when matplotlib is installed.
  if(py.loadedPackages.matplotlib)await py.runPythonAsync("import matplotlib\nmatplotlib.use('agg', force=True)");
  text='';
  postMessage({type:'running'});
  const value=await py.runPythonAsync(data.code);
  value?.destroy?.();
  let plots=[];
  if(py.loadedPackages.matplotlib){
   const result=await py.runPythonAsync("import matplotlib.pyplot as _plt, io as _io, base64 as _b64, json as _json\n_images=[]\nfor _n in _plt.get_fignums()[:3]:\n _buf=_io.BytesIO()\n _plt.figure(_n).savefig(_buf, format='png', dpi=65)\n _images.append(_b64.b64encode(_buf.getvalue()).decode('ascii'))\n_plt.close('all')\n_json.dumps(_images)");
   plots=JSON.parse(result);
  }
  postMessage({type:'done',text:text.trimEnd(),plots});
 }catch(error){postMessage({type:'error',text:(text+'\n'+String(error)).slice(0,60000)})}
};`;
addEventListener('message',event=>{
 if(event.source!==parent||event.data?.type!=='python-init'||!event.ports[0])return;
 const port=event.ports[0];let worker=null,timer=null,executionTimer=null;
 const stop=()=>{worker?.terminate();clearTimeout(timer);clearTimeout(executionTimer)};
 const send=data=>port.postMessage(data);
 port.onmessage=event=>{
  if(event.data?.type==='stop'){stop();return}
  if(event.data?.type!=='run'||typeof event.data.code!=='string'||event.data.code.length>80000)return;
  stop();
  const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
  worker=new Worker(url);URL.revokeObjectURL(url);
  timer=setTimeout(()=>{stop();send({type:'error',text:'準備または実行が2分を超えたため停止しました。'})},120000);
  worker.onmessage=event=>{
   const data=event.data;
   if(!['status','running','done','error'].includes(data?.type))return;
   if(data.type==='running'&&!executionTimer)executionTimer=setTimeout(()=>{stop();send({type:'error',text:'実行が30秒を超えたため停止しました。'})},30000);
   send(data);
   if(data.type==='done'||data.type==='error')stop();
  };
  worker.onerror=event=>{stop();send({type:'error',text:event.message||'Python環境を読み込めませんでした。'})};
  worker.postMessage({code:event.data.code});
 };
 send({type:'ready'});
},{once:true});
