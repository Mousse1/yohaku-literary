/* Paged.js is bundled locally: no manuscript is sent to an external service. */
(async () => {
  const source = document.getElementById('print-source');
  const output = document.getElementById('print-pages');
  const button = document.getElementById('print-button');
  const status = document.getElementById('pagination-status');
  const position = document.getElementById('page-number-position');
  if (!source || !output) return;
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
  try {
    if (!window.PagedModule?.Previewer) throw new Error('pagination unavailable');
    await document.fonts.ready;
    const css = document.getElementById('export-style').textContent + `
      .sheet{max-width:none;margin:0;padding:0;box-shadow:none;background:white}
      @page{size:A4;margin:19mm 18mm;
        @bottom-center{content:counter(page);font-family:system-ui,sans-serif;font-size:9pt;color:#65645e}
        @bottom-right{content:counter(page);font-family:system-ui,sans-serif;font-size:9pt;color:#65645e}
      }`;
    const content = source.cloneNode(true);
    content.removeAttribute('id');
    source.hidden = true;
    const previewer = new PagedModule.Previewer();
    await previewer.preview(content, [{[window.location.href]: css}], output);
    // Remove the source's duplicate IDs so PDF/internal links resolve to the paginated content.
    source.remove();
    document.head.appendChild(displayStyle);
    document.documentElement.dataset.pagination = 'ready';
    status.textContent = '目次の右側に開始ページを表示しました。A4・倍率100%で保存してください。';
    button.disabled = false;
  } catch (error) {
    output.replaceChildren();
    source.hidden = false;
    document.documentElement.dataset.pagination = 'error';
    status.textContent = 'ページ番号を計算できませんでした。ページを再読み込みしてください。';
    console.error('Print pagination failed', error);
  }
})();
