import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { MAX_GROUP_NAME_LENGTH, MAX_IDEA_LENGTH, validateGroupName } from '../domain/board'
import {
  DRAFT_WIDTH, NOTE_WIDTH, ROW_NOTE_HEIGHT, ROW_NOTE_WIDTH, UNCLASSIFIED_THEME, WORLD_WIDTH, YELLOW_PAPER,
  canvasHeight, clampToWorld, draftHeight, layoutNotes, nextFreeSlot, noteHeight, overlaps, tilt, topicTheme,
  type Point, type TopicTheme,
} from '../domain/layout'
import type { Idea, IdeaGroup } from '../types'
import { AddGroupForm } from './AddGroupForm'
import type { BoardView } from './BoardTopBar'
import { ChevronIcon, PencilIcon, SproutIcon } from './Icons'
import { isComposing } from '../domain/keyboard'
import { StickyNote, type NoteBox } from './StickyNote'
import type { CanvasTool } from './ToolPanel'

interface BoardCanvasProps {
  view: BoardView
  ideas: Idea[]
  groups: IdeaGroup[]
  classified: boolean
  savedPositions: Record<string, Point>
  zoom: number
  /** Space kept free above the canvas for the floating top bar (it wraps to two lines on phones). */
  topOffset: number
  tool: CanvasTool
  hits: Set<string> | null
  locked: boolean
  startWithDraft: boolean
  onToolDone: () => void
  onCreate: (text: string, at: Point) => void
  onUpdate: (idea: Idea, text: string) => Promise<void>
  onDelete: (idea: Idea) => Promise<void>
  onFavorite: (id: string) => void
  onMove: (idea: Idea, groupId: string | null) => Promise<void>
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>
  onAddGroup: (name: string) => Promise<boolean>
}

interface Draft extends Point { key: number; text: string }

interface Row {
  key: string
  group: IdeaGroup | null
  theme: TopicTheme
  ideas: Idea[]
  headY: number
  boxY: number
  boxH: number
}

const WORLD_LEFT = 24
const UNCLASSIFIED_KEY = '__unclassified__'

const groupKey = (groupId: string | null) => groupId ?? UNCLASSIFIED_KEY

export function BoardCanvas(props: BoardCanvasProps) {
  const { view, ideas, groups, classified, savedPositions, zoom, tool, hits, locked } = props
  const WORLD_TOP = props.topOffset
  const isCards = view === 'cards'
  // An empty board opens with a draft already waiting at the first slot, like the design.
  const [draft, setDraft] = useState<Draft | null>(() => props.startWithDraft && isCards && !locked
    ? { key: 1, text: '', ...nextFreeSlot([...layoutNotes(ideas, savedPositions).values()]) }
    : null)
  const [editingState, setEditingId] = useState<string | null>(null)
  const [selectedState, setSelectedId] = useState<string | null>(null)
  const [shownView, setShownView] = useState(view)
  if (shownView !== view) {
    // Switching views drops an empty draft and the selection. A draft with text was
    // already pasted by its blur handler when the tab was pressed.
    setShownView(view)
    setDraft(null)
    setSelectedId(null)
  }
  // A new view starts at the top-left instead of wherever the previous view was scrolled to.
  useEffect(() => { scrollRef.current?.scrollTo?.({ left: 0, top: 0 }) }, [view])
  const editingId = locked ? null : editingState
  const selectedId = locked ? null : selectedState
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [renaming, setRenaming] = useState<{ id: string; name: string; error: string } | null>(null)
  const draftKey = useRef(1)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const committing = useRef(false)

  const themes = useMemo(() => new Map(groups.map((group, index) => [group.id, topicTheme(index)])), [groups])
  const themeOf = useCallback((groupId: string | null) => (groupId ? themes.get(groupId) : undefined) ?? UNCLASSIFIED_THEME, [themes])
  const notes = useMemo(() => layoutNotes(ideas, savedPositions), [ideas, savedPositions])

  // Topic rows: every saved group, then 미분류 at the bottom like the design.
  const rows = useMemo(() => {
    const byGroup = new Map<string, Idea[]>()
    const oldestFirst = [...ideas].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    for (const idea of oldestFirst) byGroup.set(groupKey(idea.groupId), [...(byGroup.get(groupKey(idea.groupId)) ?? []), idea])
    const result: Row[] = []
    let y = 28
    const push = (group: IdeaGroup | null, members: Idea[]) => {
      const key = group?.id ?? UNCLASSIFIED_KEY
      const closed = Boolean(collapsed[key])
      const lines = closed ? 0 : Math.max(1, Math.ceil(members.length / 6))
      const boxY = y + 42
      const boxH = closed ? 0 : 22 + lines * 176
      result.push({ key, group, theme: group ? themeOf(group.id) : UNCLASSIFIED_THEME, ideas: members, headY: y, boxY, boxH })
      y = boxY + boxH + (closed ? 6 : 26)
    }
    groups.forEach((group) => push(group, byGroup.get(group.id) ?? []))
    const unclassified = byGroup.get(UNCLASSIFIED_KEY) ?? []
    if (unclassified.length) push(null, unclassified)
    return { rows: result, bottom: y }
  }, [collapsed, groups, ideas, themeOf])

  const rowBoxes = useMemo(() => {
    const boxes = new Map<string, NoteBox>()
    for (const row of rows.rows) {
      const closed = Boolean(collapsed[row.key])
      row.ideas.forEach((idea, index) => {
        boxes.set(idea.id, closed
          ? { x: 58, y: row.boxY - 30, w: ROW_NOTE_WIDTH, h: ROW_NOTE_HEIGHT, hidden: true }
          : { x: 58 + (index % 6) * 206, y: row.boxY + 18 + Math.floor(index / 6) * 176, w: ROW_NOTE_WIDTH, h: ROW_NOTE_HEIGHT })
      })
    }
    return boxes
  }, [collapsed, rows])

  const draftBox = draft ? { x: draft.x, y: draft.y, h: draftHeight(draft.text) } : null
  const worldHeight = isCards ? canvasHeight(notes.values(), draftBox) : Math.max(780, rows.bottom + 120)

  // ---- drafts (writing directly on the canvas) ----
  const startDraft = useCallback((at?: Point) => {
    const placed = [...notes.values()]
    const point = at ? clampToWorld(at) : nextFreeSlot(placed)
    draftKey.current += 1
    setSelectedId(null)
    setEditingId(null)
    setDraft({ key: draftKey.current, text: '', ...point })
  }, [notes])

  useEffect(() => {
    if (!draft) return
    const area = draftRef.current
    if (!area) return
    if (document.activeElement !== area) area.focus({ preventScroll: true })
    area.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [draft?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitDraft = (continueWriting: boolean) => {
    if (!draft || committing.current) return
    const text = draft.text.trim()
    if (!text) { if (!continueWriting) setDraft(null); return }
    committing.current = true
    const at = { x: draft.x, y: draft.y }
    props.onCreate(text, at)
    committing.current = false
    if (!continueWriting) { setDraft(null); return }
    const placed = [...notes.values(), { ...at, h: noteHeight(text) }]
    // Keep filling the row to the right (the design's 5-column rhythm), then wrap to the next free slot.
    let next: Point = { x: at.x + 234, y: at.y }
    if (next.x + NOTE_WIDTH > WORLD_WIDTH - 8 || overlaps(placed, next)) next = nextFreeSlot(placed)
    draftKey.current += 1
    setDraft({ key: draftKey.current, text: '', ...next })
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isComposing(event)) { event.preventDefault(); commitDraft(true) }
    else if (event.key === 'Escape') { event.preventDefault(); commitDraft(false) }
  }

  // ---- canvas pointer handling ----
  const localPoint = (event: { clientX: number; clientY: number; currentTarget: HTMLElement }): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.round((event.clientX - rect.left) / zoom), y: Math.round((event.clientY - rect.top) / zoom) }
  }
  const onWorldDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !isCards || tool !== 'select' || locked) return
    const point = localPoint(event)
    startDraft({ x: point.x - 8, y: point.y - 20 })
  }
  const onWorldPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool === 'hand' && scrollRef.current) {
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* not supported */ }
      pan.current = { x: event.clientX, y: event.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop }
      return
    }
    if (event.target !== event.currentTarget) return
    if (tool === 'memo' && isCards && !locked) {
      const point = localPoint(event)
      startDraft({ x: point.x - 8, y: point.y - 20 })
      props.onToolDone()
      return
    }
    setSelectedId(null)
  }
  const onWorldPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pan.current || !scrollRef.current) return
    scrollRef.current.scrollTo({ left: pan.current.left - (event.clientX - pan.current.x), top: pan.current.top - (event.clientY - pan.current.y) })
  }
  const onWorldPointerUp = () => { pan.current = null }

  // Drag a note onto a topic row (분류 보기).
  const rowAt = (y: number) => rows.rows.find((row) => y >= row.headY && y <= row.boxY + Math.max(row.boxH, 0) + 12)
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (isCards || locked) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (isCards || locked) return
    event.preventDefault()
    const ideaId = event.dataTransfer.getData('text/plain')
    const idea = ideas.find((item) => item.id === ideaId)
    const row = rowAt(localPoint(event).y)
    const target = row ? row.group?.id ?? null : undefined
    if (idea && target !== undefined && idea.groupId !== target) void props.onMove(idea, target)
  }

  // ---- note actions ----
  const activate = useCallback((idea: Idea) => {
    if (tool === 'hand' || locked) return
    if (tool === 'mark') { props.onFavorite(idea.id); return }
    setSelectedId((current) => current === idea.id ? null : idea.id)
  }, [locked, props, tool])
  const startEdit = useCallback((idea: Idea) => { setSelectedId(null); setEditingId(idea.id) }, [])
  const finishEdit = useCallback((idea: Idea, text: string | null) => {
    setEditingId(null)
    if (text === null) return
    const trimmed = text.trim()
    if (!trimmed || trimmed === idea.text || trimmed.length > MAX_IDEA_LENGTH) return
    void props.onUpdate(idea, trimmed)
  }, [props])
  const dragStart = useCallback((event: DragEvent<HTMLDivElement>, idea: Idea) => {
    event.dataTransfer.setData('text/plain', idea.id)
    event.dataTransfer.effectAllowed = 'move'
    setSelectedId(null)
  }, [])

  const removeSelected = async (idea: Idea) => {
    if (!window.confirm('이 메모를 지울까요?')) return
    setSelectedId(null)
    await props.onDelete(idea)
  }

  const saveRename = async () => {
    if (!renaming) return
    const error = validateGroupName(renaming.name)
    if (error) { setRenaming({ ...renaming, error }); return }
    if (await props.onRenameGroup(renaming.id, renaming.name)) setRenaming(null)
  }

  // ---- selection toolbar ----
  const selected = selectedId ? ideas.find((idea) => idea.id === selectedId) : undefined
  let toolbar: ReactNode = null
  if (selected && !locked && !editingId) {
    const box = isCards ? notes.get(selected.id) : rowBoxes.get(selected.id)
    if (box) {
      let top = Math.round(WORLD_TOP + box.y * zoom) - 52
      if (top < 60) top = Math.round(WORLD_TOP + (box.y + box.h) * zoom) + 10
      const left = Math.round(WORLD_LEFT + box.x * zoom)
      toolbar = (
        <div className="selection-toolbar" role="toolbar" aria-label="선택한 메모 도구" style={{ left, top }}>
          {isCards ? (
            <>
              <button type="button" onClick={() => startEdit(selected)}>편집</button>
              <button type="button" onClick={() => props.onFavorite(selected.id)}>{selected.favorite ? '표시 해제' : '표시'}</button>
              <button type="button" onClick={() => void removeSelected(selected)}>삭제</button>
            </>
          ) : (
            <>
              {groups.map((group) => (
                <button key={group.id} type="button" aria-pressed={selected.groupId === group.id} onClick={() => { setSelectedId(null); if (selected.groupId !== group.id) void props.onMove(selected, group.id) }}>
                  <span className="toolbar-dot" style={{ background: themeOf(group.id).accent }} />{group.name}
                </button>
              ))}
              <button type="button" aria-pressed={selected.groupId === null} onClick={() => { setSelectedId(null); if (selected.groupId !== null) void props.onMove(selected, null) }}>
                <span className="toolbar-dot" style={{ background: UNCLASSIFIED_THEME.accent }} />미분류
              </button>
              <button type="button" onClick={() => startEdit(selected)}>편집</button>
            </>
          )}
        </div>
      )
    }
  }

  const showEmpty = isCards && ideas.length === 0 && !draft?.text.trim()
  const cursor = tool === 'hand' ? 'grab' : tool === 'memo' && isCards ? 'crosshair' : 'default'

  return (
    <div className="canvas-scroll" ref={scrollRef}>
      <div className="canvas-stage" style={{ width: Math.round(WORLD_WIDTH * zoom) + 48, height: Math.round(worldHeight * zoom) + WORLD_TOP + 90 }}>
        <div
          className={`canvas-world ${isCards ? 'cards' : 'groups'}`}
          aria-label={isCards ? '메모 캔버스' : '주제별 분류'}
          role="region"
          style={{ left: WORLD_LEFT, top: WORLD_TOP, width: WORLD_WIDTH, height: worldHeight, transform: `scale(${zoom})`, cursor, touchAction: tool === 'hand' ? 'none' : 'auto' }}
          onDoubleClick={onWorldDoubleClick}
          onPointerDown={onWorldPointerDown}
          onPointerMove={onWorldPointerMove}
          onPointerUp={onWorldPointerUp}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {showEmpty ? (
            <div className="empty-board" aria-label="빈 아이디어 보드">
              <SproutIcon />
              <h2>생각나는 대로 바로 적어 보세요</h2>
              <p>다 쓰고 Enter를 누르면 메모지로 붙어요 · Shift+Enter는 다음 줄</p>
              <p>빈 곳을 두 번 누르면 그 자리에서 적을 수 있어요</p>
            </div>
          ) : null}

          {rows.rows.map((row) => (
            <div key={`box-${row.key}`} className="topic-box" aria-hidden="true" style={{ top: row.boxY, height: row.boxH, borderColor: row.theme.border, background: row.theme.tint, opacity: !isCards && row.boxH > 0 ? 1 : 0 }}>
              {!isCards && row.ideas.length === 0 && row.boxH > 0 ? <span className="topic-empty">메모를 이곳으로 끌어오거나, 메모를 누른 뒤 이 주제를 고르세요</span> : null}
            </div>
          ))}

          {classified || !isCards ? rows.rows.map((row) => {
            const name = row.group?.name ?? '미분류'
            const open = !collapsed[row.key]
            return (
              <div key={`head-${row.key}`} className="topic-head" style={{ top: row.headY, opacity: isCards ? 0 : 1, pointerEvents: isCards ? 'none' : 'auto' }}>
                {renaming && row.group && renaming.id === row.group.id ? (
                  <form className="topic-rename" onSubmit={(event) => { event.preventDefault(); void saveRename() }}>
                    <span className="topic-swatch" style={{ background: row.theme.accent }} />
                    <label className="sr-only" htmlFor={`group-name-${row.group.id}`}>주제 이름</label>
                    <input id={`group-name-${row.group.id}`} value={renaming.name} maxLength={MAX_GROUP_NAME_LENGTH} disabled={locked} autoFocus
                      onChange={(event) => setRenaming({ ...renaming, name: event.target.value, error: '' })}
                      onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(null) }} />
                    <button className="button primary compact" type="submit" disabled={locked}>저장</button>
                    <button className="button ghost compact" type="button" onClick={() => setRenaming(null)}>취소</button>
                    {renaming.error ? <span className="field-error" role="alert">{renaming.error}</span> : null}
                  </form>
                ) : (
                  <>
                    <button type="button" className="topic-toggle" aria-expanded={open} aria-label={`${name} ${open ? '접기' : '펼치기'}`} tabIndex={isCards ? -1 : 0} onClick={() => setCollapsed((current) => ({ ...current, [row.key]: !current[row.key] }))}>
                      <ChevronIcon rotate={open ? 90 : 0} />
                      <span className="topic-swatch" style={{ background: row.theme.accent }} />
                      <h2>{name}</h2>
                      <span className="topic-count">{row.ideas.length}</span>
                    </button>
                    {row.group ? <button type="button" className="icon-button plain topic-edit" aria-label={`${name} 이름 고치기`} tabIndex={isCards ? -1 : 0} disabled={locked} onClick={() => setRenaming({ id: row.group!.id, name: row.group!.name, error: '' })}><PencilIcon /></button> : null}
                  </>
                )}
              </div>
            )
          }) : null}

          {!isCards && !locked ? (
            <div className="topic-add" style={{ top: rows.bottom }}><AddGroupForm onAdd={props.onAddGroup} /></div>
          ) : null}

          {ideas.map((idea) => {
            const card = notes.get(idea.id)
            const row = rowBoxes.get(idea.id)
            const box: NoteBox | undefined = isCards ? card && { x: card.x, y: card.y, w: 200, h: card.h } : row
            if (!box) return null
            const theme = themeOf(idea.groupId)
            const paper = classified && idea.groupId ? theme.paper : !isCards && !idea.groupId ? UNCLASSIFIED_THEME.paper : YELLOW_PAPER
            return (
              <StickyNote
                key={idea.id}
                idea={idea}
                box={box}
                variant={isCards ? 'card' : 'row'}
                paper={paper}
                rotate={tilt(idea.id) * (isCards ? 1 : 0.6)}
                selected={selectedId === idea.id}
                editing={editingId === idea.id}
                highlighted={Boolean(hits?.has(idea.id))}
                dimmed={Boolean(hits && !hits.has(idea.id))}
                pinned={!isCards && idea.assignmentIsManual && idea.groupId !== null}
                locked={locked}
                draggable={!isCards}
                onActivate={activate}
                onStartEdit={startEdit}
                onFinishEdit={finishEdit}
                onDragStart={dragStart}
              />
            )
          })}

          {isCards && draft ? (
            <>
              <div className="draft-note" style={{ left: draft.x, top: draft.y, width: DRAFT_WIDTH, height: draftHeight(draft.text) }}>
                <label className="sr-only" htmlFor="memo-draft">새 메모</label>
                <textarea
                  ref={draftRef}
                  id="memo-draft"
                  value={draft.text}
                  maxLength={MAX_IDEA_LENGTH}
                  disabled={locked}
                  placeholder="적고 Enter를 누르면 메모지가 돼요"
                  onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                  onKeyDown={onDraftKeyDown}
                  onBlur={() => commitDraft(false)}
                />
              </div>
              <div className="draft-hint" aria-hidden="true" style={{ left: draft.x + 8, top: draft.y + draftHeight(draft.text) + 8 }}>
                <kbd>Enter</kbd>메모지로 붙이기<kbd>Shift + Enter</kbd>다음 줄
              </div>
            </>
          ) : null}
        </div>
        {toolbar}
      </div>
    </div>
  )
}
