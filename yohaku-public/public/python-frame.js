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
  if(py.loadedPackages.matplotlib)await py.runPythonAsync("import matplotlib\nmatplotlib.use('agg', force=True)\nimport matplotlib.pyplot as _yh_plt, io as _yh_io, base64 as _yh_b64, json as _yh_json\n_yh_figures = {}\ndef _yh_capture(*args, **kwargs):\n    for _number in _yh_plt.get_fignums():\n        _figure = _yh_plt.figure(_number)\n        if _figure not in _yh_figures and len(_yh_figures) >= 3:\n            continue\n        _buffer = _yh_io.BytesIO()\n        _figure.savefig(_buffer, format='png', dpi=65)\n        _yh_figures[_figure] = _yh_b64.b64encode(_buffer.getvalue()).decode('ascii')\n_yh_plt.show = _yh_capture\n");
  text='';
  postMessage({type:'running'});
  const value=await py.runPythonAsync(data.code);
  try{if(value!==undefined&&value!==null)append(String(value).slice(0,12000))}finally{value?.destroy?.()}
  if(!text.trim())await py.runPythonAsync("import reprlib as _yh_reprlib\n_yh_count = 0\nfor _yh_name, _yh_value in list(globals().items()):\n    if _yh_name.startswith('_'):\n        continue\n    if type(_yh_value) in (int, float, complex, bool, list, tuple, dict):\n        _yh_preview = _yh_reprlib.repr(_yh_value)\n    elif type(_yh_value).__module__ == 'numpy' and hasattr(_yh_value, 'shape'):\n        import numpy as _yh_np\n        _yh_preview = _yh_np.array2string(_yh_value, threshold=16, edgeitems=2, precision=5) if isinstance(_yh_value, _yh_np.ndarray) else str(_yh_value)\n    else:\n        continue\n    if _yh_count == 0:\n        print('Variables at end of execution (preview):')\n    print(_yh_name + ' = ' + _yh_preview[:600])\n    _yh_count += 1\n    if _yh_count >= 24:\n        break\n");
  let plots=[];
  if(py.loadedPackages.matplotlib){
   const result=await py.runPythonAsync("_yh_capture()\n_yh_plt.close('all')\n_yh_json.dumps(list(_yh_figures.values()))");
   plots=JSON.parse(result);
  }
  let variables=[];try{variables=JSON.parse(await py.runPythonAsync("import json as _yh_vjson, math as _yh_math\n_yh_variables=[]\n_yh_budget=20000\nfor _yh_key,_yh_data in list(globals().items()):\n    if _yh_key.startswith('_'):\n        continue\n    _yh_shape=None\n    if type(_yh_data).__module__=='numpy' and hasattr(_yh_data,'dtype'):\n        if _yh_data.dtype.kind not in 'biuf' or _yh_data.ndim not in (1,2):\n            continue\n        _yh_shape=list(_yh_data.shape)\n        if _yh_data.ndim==1:\n            _yh_rows=[_yh_data[:1000].tolist()]\n        elif _yh_data.shape[1]==1:\n            _yh_rows=[_yh_data[:1000,0].tolist()]\n        else:\n            _yh_rows=_yh_data[:8,:1000].tolist()\n    elif type(_yh_data) in (list,tuple):\n        if len(_yh_data)==0:\n            _yh_rows=[];_yh_shape=[0]\n        elif all(type(v) in (int,float,bool) for v in _yh_data[:1000]):\n            _yh_rows=[list(_yh_data[:1000])];_yh_shape=[len(_yh_data)]\n        else:\n            continue\n    else:\n        continue\n    _yh_clean=[]\n    for _yh_row in _yh_rows:\n        if _yh_budget<len(_yh_row):\n            break\n        _yh_clean.append([float(v) if _yh_math.isfinite(float(v)) else None for v in _yh_row])\n        _yh_budget-=len(_yh_row)\n    _yh_variables.append({'name':_yh_key,'shape':_yh_shape,'series':_yh_clean,'truncated':sum(len(r) for r in _yh_clean)<_yh_math.prod(_yh_shape)})\n    if len(_yh_variables)>=24 or _yh_budget<=0:\n        break\n_yh_vjson.dumps(_yh_variables,allow_nan=False)\n"))}catch{}
  postMessage({type:'done',text:text.trimEnd(),plots,variables});
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
