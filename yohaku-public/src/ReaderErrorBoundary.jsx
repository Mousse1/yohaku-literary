import React from 'react'
import RichBody from './RichBody'
import DescendantBodies from './DescendantBodies'

/** Isolate the failing widget, instead of discarding the entire article. */
export class ReaderPartBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { console.error('余白。: 読書パーツ表示エラー', error, info) }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() {
    if (this.state.failed) return this.props.fallback || <p className="muted" role="alert">一部を表示できませんでした。</p>
    return this.props.children
  }
}

/** Last resort: even a broken sidebar must not make a group's text disappear. */
export default class ReaderErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { console.error('余白。: 読書表示エラー', error, info) }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    const work = this.props.work
    const readable = work && ['published','open'].includes(work.status)
    return <main className="container reader-recovery" role="main">
      <h1 className="serif">{work?.title || '作品を読む'}</h1>
      <p className="hint">読書画面の付属機能で問題が発生したため、本文を優先して表示しています。</p>
      {typeof work?.body === 'string' && work.body.trim() && <ReaderPartBoundary fallback={<pre className="reader-raw-body">{work.body}</pre>}>
        <RichBody source={work.body} />
      </ReaderPartBoundary>}
      {readable && <ReaderPartBoundary fallback={<p role="alert">下位の本文を読み込めませんでした。画面の更新をお試しください。</p>}>
        <DescendantBodies rootWorkId={work.id} treeNodes={this.props.treeNodes || []} enabled />
      </ReaderPartBoundary>}
      <button type="button" className="button light" onClick={this.props.onBack}>作品一覧へ戻る</button>
    </main>
  }
}
