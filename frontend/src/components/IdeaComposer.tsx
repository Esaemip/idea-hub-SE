import { useState, type KeyboardEvent } from 'react'
import { MAX_IDEA_LENGTH, validateIdea } from '../domain/board'

interface IdeaComposerProps {
  onAdd: (text: string) => Promise<void>
  analyzing: boolean
}

export function IdeaComposer({ onAdd, analyzing }: IdeaComposerProps) {
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
    <section className={`composer canvas-composer ${text ? 'has-text' : ''}`} aria-label="새 메모 작성">
      <div className="composer-form">
        <label className="sr-only" htmlFor="idea-input">새 아이디어</label>
        <textarea id="idea-input" value={text} maxLength={MAX_IDEA_LENGTH} disabled={analyzing} onChange={(event) => { setText(event.target.value); if (error) setError('') }} onKeyDown={handleKeyDown} placeholder="적고 Enter를 누르면 메모지가 돼요" aria-describedby={error ? 'idea-error' : 'idea-help'} rows={2} />
        <div className="composer-controls">
          <span id="idea-help" className="composer-help"><kbd>Enter</kbd> 메모지로 붙이기 <kbd>Shift + Enter</kbd> 다음 줄</span>
          <span className="char-count">{text.length}/{MAX_IDEA_LENGTH}</span>
          <button className="button primary compact" type="button" onClick={() => void submit()} disabled={saving || analyzing}>{saving ? '붙이는 중…' : '메모지 붙이기'}</button>
        </div>
        {error ? <p id="idea-error" className="field-error" role="alert">{error}</p> : null}
      </div>
    </section>
  )
}
