import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_BULK_IDEAS, parseBulkIdeas } from '../domain/board'
import type { Idea } from '../types'

interface BulkInputDialogProps { open: boolean; existing: Idea[]; onClose: () => void; onAdd: (ideas: string[]) => Promise<void> }

export function BulkInputDialog({ open, existing, onClose, onAdd }: BulkInputDialogProps) {
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const savingRef = useRef(saving)
  const result = useMemo(() => parseBulkIdeas(text, existing), [text, existing])

  useEffect(() => { savingRef.current = saving }, [saving])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    textareaRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
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
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title" aria-describedby="bulk-description">
        <button className="modal-close" type="button" aria-label="닫기" disabled={saving} onClick={onClose}>×</button>
        <span className="section-kicker">일괄 입력</span><h2 id="bulk-title">여러 아이디어를 한 번에 추가</h2>
        <p id="bulk-description">한 줄을 하나의 아이디어로 처리합니다. 빈 줄과 기존 중복은 자동으로 제외해요.</p>
        <label htmlFor="bulk-input">아이디어 목록</label>
        <textarea ref={textareaRef} id="bulk-input" value={text} onChange={(event) => { setText(event.target.value); setSubmitted(false) }} rows={12} placeholder={'다크 모드 추가\n검색 결과 강조\n팀원에게 보드 공유'} />
        <div className="bulk-summary"><span>{result.ideas.length}/{MAX_BULK_IDEAS}개 추가 예정</span>{result.duplicates ? <span>{result.duplicates}개 중복 제외</span> : null}</div>
        {submitted && result.error ? <p className="field-error" role="alert">{result.error}</p> : null}
        <div className="modal-actions"><button className="button secondary" type="button" disabled={saving} onClick={onClose}>취소</button><button className="button primary" type="button" disabled={saving} onClick={() => void submit()}>{saving ? '저장 중…' : `${result.ideas.length}개 추가`}</button></div>
      </section>
    </div>
  )
}
