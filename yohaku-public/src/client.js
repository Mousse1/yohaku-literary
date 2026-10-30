import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const configured = Boolean(url && anon && !url.includes('YOUR_PROJECT') && !anon.includes('YOUR_'))
export const supabase = configured
  ? createClient(url, anon, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } })
  : null

export const categories = ['純文学','実験文学','哲学小説','詩・散文','その他']
export const noteTypes = ['比較の補足','別の先行作品','批評・異論','読後の問い']
export const reportReasons = ['著作権に関する問題','差別・嫌がらせ','個人情報の掲載','スパム・宣伝','その他']
export const dateFmt = value => value ? new Date(value).toLocaleDateString('ja-JP') : ''
export const messageFor = error => {
  const code = String(error?.code || '')
  if (code === '23505') return '既に登録されています。'
  if (code === '42501') return '権限がありません。ログイン状態や審査状況をご確認ください。'
  if (code === '23514') return '入力内容の長さや形式を確認してください。'
  return error?.message || '操作に失敗しました。'
}
export const safeUrl = value => {
  try {const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : null} catch {return null}
}

// 掲載例は架空であり、サーバーが未設定の時だけ表示します。
export const demoWorks = [
  {id:'demo-1', title:'透明な午後', pen_name:'白井 澪', genre:'純文学', theme:'記憶、喪失、時間', summary:'家族の古い写真を整理する午後。写真に写らない人物について、語り手は繰り返し語り直そうとする。', body:'　午後の光は、窓枠の埃を照らしていた。\n\n　写っていない人を思い出すことも、思い出すことなのだろうか。写真の裏に日付を書くとき、私はいつも手を止めた。', question:'記憶がないことを、記憶として語ることはできるか。', inheritance:'記憶の断片を通じて人物像を構成する方法。', novelty:'欠けた写真の説明を繰り返すことで、語りの空白を主題に変える。', created_at:'2026-01-01', status:'published', work_references:[{id:'r1',title:'川端康成『掌の小説』',relation:'表現上の参照',url:null}]},
  {id:'demo-2', title:'宛名のない手紙', pen_name:'三科 朔', genre:'実験文学', theme:'手紙、他者、存在',summary:'送り先の変わってゆく手紙。読者は宛先の変化から、書かれなかった出来事を辿る。',body:'　あなたへ。\n\n　昨日の私は、まだ手紙を書けると思っていた。\n\n　誰へ。\n\n　この言葉を読んでいるあなたは、誰でしょう。',question:'宛名を失った言葉は、誰のものになるのか。',inheritance:'告白と書簡を並置する構成。',novelty:'宛名の変化そのものを、語りの時間構造として用いる。',created_at:'2026-01-02',status:'published',work_references:[{id:'r2',title:'夏目漱石『こころ』',relation:'書簡形式の比較',url:null}]},
  {id:'demo-3',title:'反証のための独白',pen_name:'柊 透',genre:'哲学小説',theme:'認識、倫理、対話',summary:'主人公が他者への理解を証明するほど、その証拠は理解を疑わせるものになっていく。',body:'　あなたの言うことはわかる、と彼は言った。\n\n　だが「わかる」と言い終える前に、彼はその言葉を疑っていた。\n\n　注一。それは他者への不信ではなく、理解を急ぐ自分への不信である。',question:'他者を理解するとは、理解できない可能性を維持することか。',inheritance:'複数の声が同じ認識を揺らす対話的構成。',novelty:'脚注が本文への反論になる構造を試みる。',created_at:'2026-01-03',status:'published',work_references:[{id:'r3',title:'ミハイル・バフチン『ドストエフスキーの詩学』',relation:'批評・研究',url:null}]}
]
