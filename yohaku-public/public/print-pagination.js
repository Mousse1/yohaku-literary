/* Paged.js is bundled locally: no manuscript is sent to an external service. */
(async () => {
  const source = document.getElementById('print-source');
  const output = document.getElementById('print-pages');
  const button = document.getElementById('print-button');
  const status = document.getElementById('pagination-status');
  const position = document.getElementById('page-number-position');
  if (!source || !output) return;
  try {
    if(window.yohakuPrintReady)await window.yohakuPrintReady;
    if(source.querySelector('template[data-print-markdown]'))throw Error('本文の整形処理を読み込めませんでした。');
  } catch(error) {
    status.textContent='本文を準備できませんでした。再読み込みしてください。';
    document.documentElement.dataset.pagination='error';console.error(error);return;
  }

  const displayStyle = document.createElement('style');
  displayStyle.setAttribute('data-pagedjs-ignore', '');
  displayStyle.textContent = `
    #print-pages .pagedjs_page{background:white;margin:12px auto;box-shadow:0 6px 40px #0002}
    .controls{z-index:10}
    html:not([data-page-number-position="bottom-right"]) .pagedjs_margin-bottom-right .pagedjs_margin-content{visibility:hidden}
    html[data-page-number-position="bottom-right"] .pagedjs_margin-bottom-center .pagedjs_margin-content,
    html[data-page-number-position="none"] .pagedjs_margin-bottom-center .pagedjs_margin-content{visibility:hidden}
    @media print{
      html,body{background:white}#print-pages .pagedjs_page{margin:0;box-shadow:none}
      .controls,noscript{display:none}#print-source[hidden]{display:none}
      @page{size:A4;margin:0;@bottom-center{content:none}@bottom-right{content:none}}
    }`;
  const updatePosition = () => { document.documentElement.dataset.pageNumberPosition = position.value; };
  position.addEventListener('change', updatePosition);
  updatePosition();
  const settings = ['print-break-mode','print-font-size','print-density','print-reference-position','print-toc-numbers'].map(id=>document.getElementById(id));
  let previewer=null, running=false, requested=false;
  // Keep a detached original: each new layout starts from the complete manuscript.
  source.remove();
  function layoutCss() {
    const [modeControl,sizeControl,densityControl]=settings;
    const mode=modeControl.value;
    const size=[9,10,11,12,14,16].includes(Number(sizeControl.value))?Number(sizeControl.value):12;
    const density={compact:[1.25,.15,'-.02em'],standard:[1.45,.35,'.012em'],relaxed:[1.9,.8,'.02em']}[densityControl.value]||[1.45,.35,'.012em'];
    return document.getElementById('export-style').textContent.replaceAll('break-before:page','break-before:auto') + `
      .sheet{max-width:none;margin:0;padding:0;box-shadow:none;background:white;font-size:${size}pt}
      .export-record.print-page-start{break-before:page}
      .export-record.is-root,.export-record.is-heading-only+.export-record{break-before:auto}
      .export-record .print-markdown{font-size:${size}pt;line-height:${density[0]};letter-spacing:${density[2]}}
      .export-record .print-markdown p{margin:0 0 ${density[1]}em;line-height:inherit}
      .export-record .print-markdown li{margin:${density[1]/2}em 0}
      .export-record .print-markdown h1{font-size:1.5em}.export-record .print-markdown h2{font-size:1.33em}.export-record .print-markdown h3{font-size:1.17em}
      .export-record .print-markdown h4,.export-record .print-markdown h5,.export-record .print-markdown h6{font-size:1em}
      ${[3,4,5,6,7,8].map(n=>'.export-record .print-markdown p.body-paragraph-gap-'+n+'{margin-bottom:'+n/2+'em}').join('')}
      @page{size:A4;margin:19mm 18mm;
        @bottom-center{content:counter(page);font-family:system-ui,sans-serif;font-size:9pt;color:#65645e}
        @bottom-right{content:counter(page);font-family:system-ui,sans-serif;font-size:9pt;color:#65645e}
      }`;
  }
  function placeReferences(content) {
    const position=settings[3].value;
    if(position==='item')return;
    const records=[...content.querySelectorAll('.export-record')];
    const groups=new Map();
    for(const record of records){
      const references=[...record.querySelectorAll(':scope > .export-references, :scope > .attachment-print-links')];
      if(!references.length)continue;
      const key=position==='end'?'end':record.dataset.printFile;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(...references);
      references.forEach(reference=>reference.remove());
      // Once its bibliography is relocated, an empty folder should stay with its text.
      if(!record.querySelector('.body-section,.meta-section,.attachment-print-links'))record.classList.add('is-heading-only');
    }
    for(const [key,references] of groups){
      const section=document.createElement('section');
      section.className='reference-collection';
      const heading=references.some(reference=>reference.classList.contains('attachment-print-links'))?'参考文献・関連作品・添付資料':'参考文献・関連作品';
      const title=document.createElement('h2');title.textContent=heading;section.append(title);
      for(const reference of references){
        reference.querySelector('h3').textContent=reference.dataset.referenceTitle+(reference.classList.contains('attachment-print-links')?' — 添付資料':'');
        section.append(reference);
      }
      if(position==='end'){
        section.id='yohaku-collected-references';content.append(section);
        const li=document.createElement('li');const link=document.createElement('a');
        link.className='toc-page-number';link.href='#'+section.id;link.textContent=heading;li.append(link);
        content.querySelector('.toc-items').append(li);
      }else{
        const last=records.filter(record=>record.dataset.printFile===key).at(-1);
        // Keep the bibliography inside its last record, before the next file begins.
        last.append(section);
        last.classList.remove('is-heading-only');
      }
    }
  }
  async function paginate() {
    requested=true;
    if(running)return;
    running=true;
    button.disabled=true;
    for(const control of settings)control.disabled=true;
    try {
      if (!window.PagedModule?.Previewer) throw new Error('pagination unavailable');
      await document.fonts.ready;
      while(requested){
        requested=false;
        document.documentElement.dataset.pagination='loading';
        status.textContent='設定に合わせてページと目次を計算しています…';
        if(previewer){previewer.chunker.destroy();previewer.polisher.destroy();}
        output.replaceChildren();
        const content=source.cloneNode(true);
        content.removeAttribute('id');
        placeReferences(content);
        if(settings[4].value==='body'){
          content.querySelectorAll('.toc-items li[data-toc-kind="file"] a').forEach(link=>link.classList.remove('toc-page-number'));
        }
        const mode=settings[0].value;
        const records=[...content.querySelectorAll('.export-record')];
        records.forEach((record,index)=>record.classList.toggle('print-page-start',index>0 &&
          !records[index-1].classList.contains('is-heading-only') &&
          (mode==='item'||mode==='file'&&record.classList.contains('file-start'))));
        previewer=new PagedModule.Previewer();
        await previewer.preview(content,[{[window.location.href]:layoutCss()}],output);
        document.head.appendChild(displayStyle);
      }
      document.documentElement.dataset.pagination='ready';
      status.textContent='目次の右側に開始ページを表示しました。A4・倍率100%で保存してください。';
      button.disabled=false;
    } catch(error) {
      document.documentElement.dataset.pagination='error';
      status.textContent='ページを計算できませんでした。設定を変更するか、ページを再読み込みしてください。';
      console.error('Print pagination failed',error);
    } finally {
      running=false;
      for(const control of settings)control.disabled=false;
    }
  }
  for(const control of settings)control.addEventListener('change',paginate);
  await paginate();
})();
