export function numericVariables(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,24).filter(v=>v&&typeof v.name==='string'&&Array.isArray(v.series)).map(v=>({...v,name:v.name.slice(0,120),series:v.series.slice(0,8).filter(Array.isArray).map(r=>r.slice(0,1000).map(n=>typeof n==='number'&&Number.isFinite(n)?n:null))}));
}
export const graphable=v=>v.series.some(row=>row.some(n=>n!==null));
export function preferredVariable(variables){return ['costsq_','losses','loss_history','z2','y_pred','predictions'].map(name=>variables.find(v=>v.name===name&&graphable(v))).find(Boolean)||variables.find(graphable)}
export function drawNumericGraph(canvas,variable,kind='line'){
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('グラフを描画できません');
 const W=800,H=400,L=76,R=24,T=48,B=60;canvas.width=W;canvas.height=H;
 const values=variable.series.flat().filter(n=>n!==null);if(!values.length)return '';
 let lo=Math.min(0,...values),hi=Math.max(0,...values);if(lo===hi){lo-=1;hi+=1}
 const scale=Math.max(Math.abs(lo),Math.abs(hi),1),low=lo/scale,high=hi/scale;
 const N=Math.max(...variable.series.map(r=>r.length));const x=i=>L+(W-L-R)*(kind==='bar'?(i+.5)/N:i/Math.max(N-1,1));const y=v=>T+(H-T-B)*(high-v/scale)/(high-low);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.font='16px sans-serif';ctx.fillStyle='#292821';ctx.fillText(variable.name+' — '+(kind==='bar'?'Bar chart':'Line chart'),L,26);
 for(let i=0;i<=4;i++){const f=i/4,v=(low+(high-low)*f)*scale,yy=T+(H-T-B)*(1-f);ctx.strokeStyle='#e2ded8';ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(W-R,yy);ctx.stroke();ctx.fillStyle='#555';ctx.fillText(Number(v.toPrecision(3)).toString(),4,yy+5)}
 ctx.strokeStyle='#666';ctx.strokeRect(L,T,W-L-R,H-T-B);ctx.fillStyle='#555';ctx.fillText('0',L,H-B+24);ctx.fillText(String(N-1),W-R-30,H-B+24);ctx.fillText('Index',W/2,H-12);
 const colors=['#2864a0','#b35b37','#35875a','#985ca0','#ae861d','#47848b','#b65d83','#555'];
 variable.series.forEach((row,k)=>{ctx.strokeStyle=colors[k];ctx.fillStyle=colors[k];ctx.lineWidth=2;ctx.beginPath();let joined=false;
 row.forEach((v,i)=>{if(v===null){joined=false;return}if(kind==='bar'){const width=Math.max(.5,(W-L-R)/N*.8/variable.series.length);ctx.fillRect(x(i)-(W-L-R)/N*.4+k*width,Math.min(y(0),y(v)),width,Math.max(1,Math.abs(y(v)-y(0))))}else{if(joined)ctx.lineTo(x(i),y(v));else ctx.moveTo(x(i),y(v));joined=true;if(N===1){ctx.fillRect(x(i)-3,y(v)-3,6,6)}}});ctx.stroke();if(variable.series.length>1){ctx.fillRect(L+k*84,H-22,12,4);ctx.fillText('row '+k,L+16+k*84,H-15)}});
 return canvas.toDataURL('image/png').split(',')[1];
}
