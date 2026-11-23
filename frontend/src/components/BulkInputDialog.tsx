import { useEffect, useMemo, useState } from 'react'
import { MAX_BULK_IDEAS, parseBulkIdeas } from '../domain/board'
import type { Idea } from '../types'

interface BulkInputDialogProps { open: boolean; existing: Idea[]; onClose: () => void; onAdd: (ideas: string[]) => Promise<void> }

export function BulkInputDialog({ open, existing, onClose, onAdd }: BulkInputDialogProps) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const result = useMemo(() => parseBulkIdeas(text, existing), [text, existing])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const submit = async () => {
    setSubmitted(true)
    if (result.error) return
    setSaving(true)
    await onAdd(result.ideas)
    setSaving(false); setText(''); setSubmitted(false); onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
        <button className="modal-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
        <span className="section-kicker">일괄 입력</span><h2 id="bulk-title">여러 아이디어를 한 번에 추가</h2>
        <p>한 줄을 하나의 아이디어로 처리합니다. 빈 줄과 기존 중복은 자동으로 제외해요.</p>
        <label htmlFor="bulk-input">아이디어 목록</label>
        <textarea id="bulk-input" value={text} onChange={(event) => { setText(event.target.value); setSubmitted(false) }} rows={12} placeholder={'다크 모드 추가\n검색 결과 강조\n팀원에게 보드 공유'} autoFocus />
        <div className="bulk-summary"><span>{result.ideas.length}/{MAX_BULK_IDEAS}개 추가 예정</span>{result.duplicates ? <span>{result.duplicates}개 중복 제외</span> : null}</div>
        {submitted && result.error ? <p className="field-error" role="alert">{result.error}</p> : null}
        <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>취소</button><button className="button primary" type="button" disabled={saving} onClick={() => void submit()}>{saving ? '저장 중…' : `${result.ideas.length}개 추가`}</button></div>
      </section>
    </div>
  )
}
