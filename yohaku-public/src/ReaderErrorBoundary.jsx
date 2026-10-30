import React from 'react'

/** Never let an unexpected reader component error blank the entire app. */
export default class ReaderErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) {
    console.error('余白。: 読書表示エラー', error, info)
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() {
    if (!this.state.failed) return this.props.children
    const work = this.props.work
    return <main className="container reader-recovery" role="alert">
      <h1 className="serif">{work?.title || '作品を読む'}</h1>
      <p>読書画面の一部を表示できませんでした。本文を簡易表示しています。</p>
      {work?.body?.trim() ? <pre className="reader-raw-body">{work.body}</pre> :
        <p>このグループの下位本文を表示できませんでした。「作品一覧へ戻る」から読み直してください。</p>}
      <button type="button" className="button light" onClick={this.props.onBack}>作品一覧へ戻る</button>
    </main>
  }
}
