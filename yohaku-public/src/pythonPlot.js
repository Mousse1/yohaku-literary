import React from 'react'
import {safePythonPlot} from './pythonOutput.js'
export function PythonCode({className,children,node,...props}){
 const value=String(children||'').trim();
 if(className==='language-yohaku-python-plot')return safePythonPlot(value)?React.createElement('img',{className:'python-output-image',src:'data:image/png;base64,'+value,alt:'Python実行結果のグラフ'}):React.createElement('span',null,'画像データを表示できません。');
 return React.createElement('code',{className,...props},children)
}
