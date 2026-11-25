import { useState, type KeyboardEvent } from 'react'
import { MAX_IDEA_LENGTH, validateIdea } from '../domain/board'

interface IdeaComposerProps {
  onAdd: (text: string) => Promise<void>
  onOpenBulk: () => void
  onAnalyze: () => Promise<void>
  analyzing: boolean
  syncing: boolean
  remoteEnabled: boolean
}

export function IdeaComposer({ onAdd, onOpenBulk, onAnalyze, analyzing, syncing, remoteEnabled }: IdeaComposerProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (analyzing || saving) return
    const message = validateIdea(text)
    if (message) { setError(message); return }
    setSaving(true)
    setError('')
    try {
      await onAdd(text.trim())
      setText('')
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
  }

  return (
    <section className="composer" aria-labelledby="composer-title">
      <div>
        <span className="section-kicker">카드</span>
        <h2 id="composer-title">새 메모 붙이기</h2>
        <p>Enter로 메모지를 붙이고 Shift + Enter로 다음 줄을 입력하세요.</p>
      </div>
      <div className="composer-form">
        <label className="sr-only" htmlFor="idea-input">새 아이디어</label>
        <textarea id="idea-input" value={text} maxLength={MAX_IDEA_LENGTH} disabled={analyzing} onChange={(event) => { setText(event.target.value); if (error) setError('') }} onKeyDown={handleKeyDown} placeholder="예: 회의가 끝나면 결정 사항을 자동으로 정리하기" aria-describedby={error ? 'idea-error' : 'idea-help'} rows={2} />
        <div className="composer-controls">
          <span id="idea-help" className="char-count">{text.length}/{MAX_IDEA_LENGTH}</span>
          <button className="button analyze" type="button" aria-label={analyzing ? '아이디어 분석 중' : '아이디어 분석'} onClick={() => void onAnalyze()} disabled={!remoteEnabled || analyzing || saving || syncing} title={!remoteEnabled ? '서버 연결 후 사용할 수 있어요.' : syncing ? '현재 저장이 끝나면 분석할 수 있어요.' : '저장된 아이디어를 비슷한 주제로 분류합니다.'}>{analyzing ? '분류 중…' : '✦ 분류하기'}</button>
          <button className="button secondary" type="button" onClick={onOpenBulk} disabled={saving || analyzing}>여러 개 입력</button>
          <button className="button primary" type="button" onClick={() => void submit()} disabled={saving || analyzing}>{saving ? '추가 중…' : '아이디어 추가'}</button>
        </div>
        {error ? <p id="idea-error" className="field-error" role="alert">{error}</p> : null}
      </div>
    </section>
  )
}
