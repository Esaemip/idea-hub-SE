import { memo, useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import { MAX_IDEA_LENGTH } from '../domain/board'
import { isComposing } from '../domain/keyboard'
import type { Idea } from '../types'
import { StarIcon } from './Icons'

export interface NoteBox { x: number; y: number; w: number; h: number; hidden?: boolean }

interface StickyNoteProps {
  idea: Idea
  box: NoteBox
  variant: 'card' | 'row'
  paper: string
  rotate: number
  selected: boolean
  editing: boolean
  highlighted: boolean
  dimmed: boolean
  pinned: boolean
  locked: boolean
  draggable: boolean
  onActivate: (idea: Idea) => void
  onStartEdit: (idea: Idea) => void
  onFinishEdit: (idea: Idea, text: string | null) => void
  onDragStart?: (event: DragEvent<HTMLDivElement>, idea: Idea) => void
}

const STICK = '0 1px 1px rgba(60,48,10,0.10), 0 14px 20px -12px rgba(60,48,10,0.50)'
const LIFT = '0 1px 1px rgba(60,48,10,0.10), 0 22px 30px -14px rgba(60,48,10,0.55)'
const SELECTED = '0 0 0 2px #0D99FF, 0 10px 24px rgba(13,153,255,0.18)'

/** Textarea shown while a pasted note is being changed. Mounted only during editing. */
function NoteEditor({ idea, onFinish }: { idea: Idea; onFinish: (text: string | null) => void }) {
  const [text, setText] = useState(idea.text)
  const finished = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const area = areaRef.current
    if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length) }
  }, [])
  const finish = (value: string | null) => {
    if (finished.current) return
    finished.current = true
    onFinish(value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isComposing(event)) { event.preventDefault(); finish(text) }
    else if (event.key === 'Escape') { event.preventDefault(); finish(null) }
  }
  return (
    <>
      <label className="sr-only" htmlFor={`edit-${idea.id}`}>메모 고치기</label>
      <textarea ref={areaRef} id={`edit-${idea.id}`} className="note-text" value={text} maxLength={MAX_IDEA_LENGTH}
        onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} onBlur={() => finish(text)} />
    </>
  )
}

export const StickyNote = memo(function StickyNote(props: StickyNoteProps) {
  const { idea, box, variant, paper, rotate, selected, editing, highlighted, dimmed, pinned, locked, draggable } = props
  let shadow = editing ? LIFT : STICK
  if (highlighted) shadow = '0 0 0 4px rgba(13,153,255,0.35)'
  if (selected) shadow = SELECTED
  const style: CSSProperties = {
    left: box.x, top: box.y, width: box.w, height: box.h,
    background: paper,
    boxShadow: shadow,
    opacity: box.hidden ? 0 : dimmed ? 0.22 : 1,
    pointerEvents: box.hidden ? 'none' : 'auto',
    transform: `rotate(${editing || selected ? 0 : rotate}deg)`,
    zIndex: editing || selected ? 4 : 2,
  }

  return (
    <div
      className={`sticky-note ${variant}`}
      style={style}
      data-idea-id={idea.id}
      draggable={draggable && !editing && !locked}
      onDragStart={(event) => props.onDragStart?.(event, idea)}
    >
      <span className="note-glue" aria-hidden="true" />
      {idea.favorite ? <span className="note-star" title="표시한 메모"><StarIcon size={18} filled /></span> : null}
      {editing ? (
        <NoteEditor idea={idea} onFinish={(value) => props.onFinishEdit(idea, value)} />
      ) : (
        <button
          type="button"
          className="note-text"
          aria-pressed={selected}
          aria-label={idea.text}
          disabled={box.hidden}
          onClick={() => props.onActivate(idea)}
          onDoubleClick={() => { if (!locked) props.onStartEdit(idea) }}
        >
          <span className="note-body">{idea.text}</span>
          {pinned ? <span className="note-badge" title="직접 옮긴 메모는 다시 분류해도 그대로 있어요">고정</span> : null}
        </button>
      )}
    </div>
  )
})
