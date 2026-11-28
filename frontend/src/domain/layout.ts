import type { Idea } from '../types'

/** Canvas sizes follow docs/design/board-ui (Memo board). All values are world pixels before zoom. */
export const WORLD_WIDTH = 1360
export const NOTE_WIDTH = 200
export const DRAFT_WIDTH = 400
export const ROW_NOTE_WIDTH = 190
export const ROW_NOTE_HEIGHT = 162
export const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.85, 1, 1.25] as const
export const DEFAULT_ZOOM_INDEX = 2

export interface Point { x: number; y: number }

export const YELLOW_PAPER = '#FFEF96'

export interface TopicTheme {
  /** Accent used for the row marker and toolbar dot. */
  accent: string
  /** Row box border. */
  border: string
  /** Row box background. */
  tint: string
  /** Sticky-note paper after classification. */
  paper: string
}

const TOPIC_THEMES: TopicTheme[] = [
  { accent: '#2F6FEB', border: '#DCE7FD', tint: '#F3F7FE', paper: '#D6E5FF' },
  { accent: '#E8620F', border: '#FCE3D2', tint: '#FEF6F0', paper: '#FFDFC6' },
  { accent: '#8B3FD9', border: '#ECE0FA', tint: '#F8F3FE', paper: '#EADCFF' },
  { accent: '#0E9468', border: '#D3F0E3', tint: '#F1FAF6', paper: '#CDEFDD' },
  { accent: '#D6336C', border: '#FADBE6', tint: '#FEF4F7', paper: '#FFD8E5' },
  { accent: '#0B8A9C', border: '#CFEEF2', tint: '#F0FAFB', paper: '#C9EEF3' },
  { accent: '#9A6700', border: '#F4E3BC', tint: '#FDF8EC', paper: '#F6E7C1' },
]

export const UNCLASSIFIED_THEME: TopicTheme = { accent: '#8A8D97', border: '#E7E8EC', tint: '#F6F6F8', paper: '#E9E9EC' }

export const topicTheme = (index: number): TopicTheme => TOPIC_THEMES[index % TOPIC_THEMES.length]

const lineCount = (text: string, perLine: number): number =>
  text.split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0)

/** Height of a pasted sticky note in the card view. */
export const noteHeight = (text: string): number => Math.max(200, 48 + lineCount(text, 8) * 27)

/** Height of the borderless draft that is still being written. */
export const draftHeight = (text: string): number => Math.max(1, lineCount(text, 13)) * 30 + 12

export const slot = (index: number): Point => ({ x: 48 + (index % 5) * 234, y: 40 + Math.floor(index / 5) * 232 })

export interface PlacedNote extends Point { h: number }

export const overlaps = (placed: PlacedNote[], point: Point): boolean =>
  placed.some((note) => point.x < note.x + NOTE_WIDTH + 14 && point.x + NOTE_WIDTH + 14 > note.x && point.y < note.y + note.h + 12 && point.y + 200 > note.y)

export const nextFreeSlot = (placed: PlacedNote[]): Point => {
  for (let index = 0; index < 400; index += 1) {
    const point = slot(index)
    if (!overlaps(placed, point)) return point
  }
  return slot(placed.length)
}

/** Clamp a point so a note stays inside the canvas width. */
export const clampToWorld = (point: Point): Point => ({
  x: Math.round(Math.min(Math.max(point.x, 8), WORLD_WIDTH - NOTE_WIDTH - 8)),
  y: Math.round(Math.max(point.y, 8)),
})

/** Small, stable tilt so pasted notes look hand-placed. */
export const tilt = (id: string): number => {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997
  return ((hash % 31) - 15) / 10
}

/** Key used to remember a note position before and after the server assigns an id. */
export const positionKey = (idea: Pick<Idea, 'id' | 'serverId'>): string => idea.serverId !== undefined ? `s${idea.serverId}` : idea.id

const byCreation = (ideas: Idea[]): Idea[] => ideas
  .map((idea, index) => ({ idea, index }))
  .sort((a, b) => Date.parse(a.idea.createdAt) - Date.parse(b.idea.createdAt) || b.index - a.index)
  .map((entry) => entry.idea)

/**
 * Place every note: saved positions first, then the remaining notes (oldest first) in the
 * first free slot of the 5-column grid from the design.
 */
export const layoutNotes = (ideas: Idea[], saved: Record<string, Point>): Map<string, PlacedNote> => {
  const result = new Map<string, PlacedNote>()
  const placed: PlacedNote[] = []
  const ordered = byCreation(ideas)
  for (const idea of ordered) {
    const point = saved[positionKey(idea)] ?? saved[idea.id]
    if (!point) continue
    const note = { ...point, h: noteHeight(idea.text) }
    result.set(idea.id, note)
    placed.push(note)
  }
  for (const idea of ordered) {
    if (result.has(idea.id)) continue
    const note = { ...nextFreeSlot(placed), h: noteHeight(idea.text) }
    result.set(idea.id, note)
    placed.push(note)
  }
  return result
}

export const canvasHeight = (notes: Iterable<PlacedNote>, draft?: PlacedNote | null): number => {
  let bottom = 0
  for (const note of notes) bottom = Math.max(bottom, note.y + note.h)
  if (draft) bottom = Math.max(bottom, draft.y + draft.h + 40)
  return Math.max(780, bottom + 200)
}

/** Re-key positions saved under a local id once the server id is known. Returns the same object when nothing moves. */
export const movePositionsToServerIds = (positions: Record<string, Point>, ideas: Idea[]): Record<string, Point> => {
  let next = positions
  for (const idea of ideas) {
    const key = positionKey(idea)
    if (key === idea.id || !positions[idea.id]) continue
    if (next === positions) next = { ...positions }
    if (!next[key]) next[key] = positions[idea.id]
    delete next[idea.id]
  }
  return next
}
