import {readAttachmentFile} from './attachments.js'
import React,{useRef,useState} from 'react'
import {AttachmentView} from './AttachmentView.js'
import {safePythonPlot} from './pythonOutput.js'
export default function AttachmentEditor({items,onChange,onAdd}){
 const input=useRef(),fileInput=useRef();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function attachFile(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{onAdd(await readAttachmentFile(file))}catch(err){setError(err.message||'読み込めませんでした。')}finally{setBusy(false)}}
 async function upload(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;setError('');setBusy(true);
  let bitmap;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10000000)throw Error('10MB以内のPNG・JPEG・WebP画像を選んでください。');
   bitmap=await createImageBitmap(file);
   let scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));let png='';
   for(let i=0;i<12;i++){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);png=canvas.toDataURL('image/png').split(',')[1];if(png.length<=100000)break;scale*=.8;
   }
   if(!safePythonPlot(png)||png.length>100000)throw Error('画像が大きすぎます。必要な部分を切り取ってください。');
   onAdd({kind:'image',name:file.name.slice(0,120),caption:'',png});
  }catch(err){setError(err.message||'画像を読み込めませんでした。')}finally{bitmap?.close();setBusy(false)}
 }
 return <section className="attachment-editor"><h3>添付資料</h3><p className="hint">Python・Leanコード、JSON・CSV・テキストの結果ファイル、スクリーンショットを添付できます。読者は「ファイルを開く」で内容を確認し、保存できます。画像は容量に合わせて縮小します。保存前に文字の読みやすさを確認してください。</p><input hidden type="file" accept=".py,.lean,.json,.csv,.txt" ref={fileInput} onChange={attachFile}/><button type="button" className="button light small" disabled={busy||items.length>=10} onClick={()=>fileInput.current.click()}>ファイルを添付（.py / .lean / .json / .csv / .txt）</button>{' '}<input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/><button type="button" className="button light small" disabled={busy||items.length>=10} onClick={()=>input.current.click()}>{busy?'画像を準備中…':'結果の画像を添付'}</button><p role="status">{error}</p>{items.map((a,i)=><div key={i}><label>資料{i+1}の名前<input maxLength={120} value={a.name} onChange={e=>onChange(items.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/></label><label>説明（任意）<textarea rows={2} maxLength={1000} value={a.caption} onChange={e=>onChange(items.map((x,j)=>j===i?{...x,caption:e.target.value}:x))}/></label>{a.format==='lean'&&<><label>Leanのバージョン（任意）<input maxLength={120} value={a.leanVersion||''} placeholder="使用したLeanのバージョン" onChange={e=>onChange(items.map((x,j)=>j===i?{...x,leanVersion:e.target.value}:x))}/></label><label>依存ライブラリ・環境（任意）<textarea rows={2} maxLength={1000} value={a.leanDependencies||''} placeholder="Mathlibのバージョンや必要なプロジェクトなど" onChange={e=>onChange(items.map((x,j)=>j===i?{...x,leanDependencies:e.target.value}:x))}/></label></>}<button className="text-action dangerous" type="button" onClick={()=>onChange(items.filter((_,j)=>j!==i))}>資料{i+1}を削除</button></div>)}<AttachmentView attachments={items}/><p className="hint">最大10件。本文と添付データを合わせて20万文字分まで保存できます。添付資料の公開範囲は作品と同じです。通常の保存・公開操作で反映されます。</p></section>
}
