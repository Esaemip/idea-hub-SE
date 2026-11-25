import { memo, useState } from 'react'
import { MAX_IDEA_LENGTH, validateIdea } from '../domain/board'
import type { Idea, IdeaGroup } from '../types'

interface IdeaCardProps {
  idea: Idea
  groups: IdeaGroup[]
  interactionLocked?: boolean
  dragEnabled?: boolean
  onUpdate: (idea: Idea, text: string) => Promise<void>
  onDelete: (idea: Idea) => Promise<void>
  onFavorite: (id: string) => void
  onMove: (idea: Idea, groupId: string | null) => Promise<void>
}

export const IdeaCard = memo(function IdeaCard({ idea, groups, interactionLocked = false, dragEnabled = true, onUpdate, onDelete, onFavorite, onMove }: IdeaCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(idea.text)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const message = validateIdea(draft)
    if (message) { setError(message); return }
    setBusy(true)
    try {
      await onUpdate(idea, draft)
      setEditing(false)
      setError('')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!window.confirm('이 아이디어를 삭제할까요?')) return
    setBusy(true)
    try { await onDelete(idea) } finally { setBusy(false) }
  }
  const move = async (groupId: string | null) => {
    setBusy(true)
    try { await onMove(idea, groupId) } finally { setBusy(false) }
  }

  return (
    <article className="idea-card" aria-busy={busy || interactionLocked} draggable={dragEnabled && !interactionLocked && !editing && !busy} onDragStart={(event) => { if (!dragEnabled || interactionLocked) { event.preventDefault(); return }; event.dataTransfer.setData('text/plain', idea.id); event.dataTransfer.effectAllowed = 'move' }}>
      <div className="card-topline"><span className={`drag-handle ${interactionLocked || !dragEnabled ? 'locked' : ''}`} title={!dragEnabled ? '분류 보기에서 그룹 사이로 끌어 이동할 수 있습니다.' : interactionLocked ? '분석이 끝나면 이동할 수 있습니다.' : '다른 그룹으로 끌어서 이동'} aria-hidden="true">⠿</span><button className={`icon-button star ${idea.favorite ? 'active' : ''}`} type="button" aria-label={idea.favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'} aria-pressed={idea.favorite} disabled={busy || interactionLocked} onClick={() => onFavorite(idea.id)}>★</button></div>
      {editing ? (
        <div className="edit-panel">
          <label className="sr-only" htmlFor={`edit-${idea.id}`}>아이디어 수정</label>
          <textarea id={`edit-${idea.id}`} value={draft} maxLength={MAX_IDEA_LENGTH} disabled={busy || interactionLocked} onChange={(event) => setDraft(event.target.value)} autoFocus rows={4} />
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          <div className="inline-actions"><button className="button ghost compact" type="button" disabled={busy} onClick={() => { setEditing(false); setDraft(idea.text); setError('') }}>취소</button><button className="button primary compact" type="button" disabled={busy || interactionLocked} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button></div>
        </div>
      ) : <button className="card-text" type="button" disabled={busy || interactionLocked} onClick={() => setEditing(true)} aria-label={`${idea.text} 수정`}>{idea.text}</button>}
      <div className="card-footer">
        <label className="group-select-label"><span className="sr-only">카드 그룹 이동</span><select value={idea.groupId ?? ''} disabled={busy || interactionLocked} onChange={(event) => void move(event.target.value || null)} aria-label="카드 그룹 이동"><option value="">미분류</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        {idea.assignmentIsManual ? <span className="manual-badge" title="사용자가 직접 배치함">고정</span> : null}
        <button className="icon-button delete" type="button" aria-label="아이디어 삭제" disabled={busy || interactionLocked} onClick={() => void remove()}>×</button>
      </div>
    </article>
  )
})
