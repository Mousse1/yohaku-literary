import {xorExample} from './pythonExamples.js'
import React,{useEffect,useRef,useState} from 'react'
import {executePython} from './pythonExecution.js'
import {PYTHON_CODE_LIMIT,safePythonPlot,pythonPublication} from './pythonOutput.js'
export default function PythonEditor({onInsert,onAttach,allowBodyInsert=true}){
 const [code,setCode]=useState('print("こんにちは、余白")');const [name,setName]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[result,setResult]=useState(null);
 const file=useRef(),cancel=useRef(null),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;cancel.current?.()},[]);
 function edit(value){setCode(value);setResult(null);setStatus('')}
 async function importFile(event){
  const selected=event.target.files?.[0];event.target.value='';if(!selected)return;
  const version=++generation.current;
  try{
   if(!/\.py$/i.test(selected.name))throw Error('.pyファイルを選んでください。');
   if(selected.size>PYTHON_CODE_LIMIT*4)throw Error('コードは8万文字以内にしてください。');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(await selected.arrayBuffer()).replace(/\r\n?/g,'\n');
   if(text.length>PYTHON_CODE_LIMIT)throw Error('コードは8万文字以内にしてください。');
   if(version!==generation.current)return;
   edit(text);setName(selected.name);
  }catch(error){setStatus(error.message||'UTF-8の.pyファイルを選んでください。')}
 }
 function run(){
  cancel.current?.();const version=++generation.current;
  setBusy(true);setResult(null);setStatus('実行環境を開いています…');
  cancel.current=executePython(code,data=>{
   if(version!==generation.current)return;
   if(data.type==='status')setStatus(typeof data.text==='string'?data.text.slice(0,200):'準備中…');
   if(data.type==='running')setStatus('実行中…（最大30秒）');
   if(data.type==='done'||data.type==='error'){
    const plots=(Array.isArray(data.plots)?data.plots:[]).slice(0,3).filter(safePythonPlot);
    setResult({text:typeof data.text==='string'?data.text.slice(0,60000):'',plots});
    setBusy(false);setStatus(data.type==='error'?'実行中にエラーが発生しました。':(data.plots?.length>plots.length?'大きすぎる画像は省略しました。図の大きさを小さくして再実行してください。':'実行が完了しました。結果を確認して保存・添付できます。'));
   }
  });
 }
 function stop(){generation.current++;cancel.current?.();setBusy(false);setStatus('停止しました。')}
 return <details className="python-editor"><summary>Python（.py）の取り込み・実行</summary>
  <p className="hint">この端末のブラウザ内で実行します。初回は実行環境やライブラリの読み込みに時間がかかります。標準PythonとNumPy・pandas・Matplotlibなどに対応。端末のファイル、対話入力、外部サービスへの通信が必要なコードはそのまま動かない場合があります。</p>
  <input hidden type="file" accept=".py" ref={file} onChange={importFile}/>
  <button type="button" className="button light small" disabled={busy} onClick={()=>file.current.click()}>.pyファイルを取り込む</button>{name&&<span className="hint"> {name}</span>}
  <button type="button" className="button light small" disabled={busy} onClick={()=>{if(code.trim()&&code!=='print("こんにちは、余白")'&&!window.confirm('現在のコードをXORのグラフ付き実行例に置き換えますか？'))return;generation.current++;edit(xorExample);setName('xor-learning.py')}}>グラフ付き実行例（XOR）</button>
  <p className="hint">グラフは plt.plot(...) などで作成します。plt.show() の図も表示します。文字出力がない場合は、数値や配列などの変数を抜粋して表示します。学習曲線には、誤差の記録と描画処理が必要です。</p>
  <label>Pythonコード<textarea aria-label="Pythonコード" rows={10} maxLength={PYTHON_CODE_LIMIT} value={code} disabled={busy} spellCheck={false} onChange={e=>{generation.current++;edit(e.target.value)}}/></label>
  <div className="python-actions">{onAttach&&<button type="button" className="button primary small" disabled={busy||!code.trim()} onClick={()=>onAttach({kind:'python',name:(name||'program.py').slice(0,120),caption:'',code})}>コードを添付資料に追加</button>}<button type="button" className="button primary small" disabled={busy||!code.trim()} onClick={run}>実行する</button>{busy&&<button type="button" className="button light small" onClick={stop}>停止する</button>}
  {allowBodyInsert&&<button type="button" className="button light small" disabled={busy||!code.trim()} onClick={()=>onInsert(pythonPublication(code,null))}>コードを本文に挿入</button>}</div>
  <p className="hint" role="status">{status}</p>
  {result&&<div className="python-result"><h4>実行結果</h4>{result.text?<pre>{result.text}</pre>:<p className="hint">文字出力なし</p>}{result.plots.map((plot,i)=><figure key={i}><img src={'data:image/png;base64,'+plot} alt={'Pythonで生成したグラフ '+(i+1)}/><figcaption><a download={'graph-'+(i+1)+'.png'} href={'data:image/png;base64,'+plot}>グラフをPNGで保存</a></figcaption></figure>)}
  {result.text&&<><a className="button light small" download="python-result.txt" href={'data:text/plain;charset=utf-8,'+encodeURIComponent(result.text)}>文字結果を保存</a>{onAttach&&<button type="button" className="button light small" onClick={()=>onAttach({kind:'text',format:'txt',name:'python-result.txt',caption:'Pythonの実行結果',text:result.text})}>文字結果を添付資料に追加</button>}</>}
  {!result.plots.length&&<p className="hint">図がない場合は、plt.plot(...) や plt.bar(...) などの描画処理を追加してください。「グラフ付き実行例（XOR）」も利用できます。</p>}
  {allowBodyInsert&&<button type="button" className="button light small" onClick={()=>onInsert(pythonPublication(code,result,{includeCode:false}))}>結果を本文に挿入</button>}{' '}
  {allowBodyInsert&&<button type="button" className="button light small" onClick={()=>onInsert(pythonPublication(code,result))}>コードと結果を本文に挿入</button>}
  {onAttach&&result.plots.length>0&&<button type="button" className="button light small" onClick={()=>result.plots.forEach((png,i)=>onAttach({kind:'image',name:'実行結果 '+(i+1)+'.png',caption:'Pythonで生成したグラフ',png}))}>グラフを添付資料に追加</button>}<p className="hint">挿入後、通常の保存・公開操作で掲載されます。読者が開いても自動実行しません。グラフは最大3枚で、本文の20万文字上限に画像データも含みます。</p></div>}
 </details>
}
