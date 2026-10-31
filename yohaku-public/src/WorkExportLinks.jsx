import React from 'react'
import { Download } from 'lucide-react'

// ダウンロード用URLはWorker側で匿名公開データを再確認して生成する。
// PDFにはブラウザの印刷／PDF保存を使い、日本語フォントを端末側で処理する。
export default function WorkExportLinks({workId,compact=false}) {
  const base=`/export/works/${encodeURIComponent(workId)}`
  return <details className={'work-export'+(compact?' work-export-compact':'')}>
    <summary className={compact?'text-action':'button light small'}><Download size={compact?13:15}/> ファイルで共有</summary>
    <div className="work-export-menu">
      <a href={`${base}/print`} target="_blank" rel="noopener noreferrer">PDFとして保存（印刷画面）</a>
      <a href={`${base}.txt`}>テキスト（.txt）を保存</a>
      <a href={`${base}.md`}>Markdown（.md）を保存</a>
      <p>公開済みの下位作品も含みます。PDFは印刷画面で「PDFに保存」を選んでください。</p>
    </div>
  </details>
}
