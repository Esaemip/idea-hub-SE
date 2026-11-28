import type { ReactNode } from 'react'
import { ChevronIcon, CursorIcon, HandIcon, NoteIcon, StarIcon } from './Icons'

export type CanvasTool = 'select' | 'hand' | 'memo' | 'mark'

interface ToolPanelProps {
  open: boolean
  tool: CanvasTool
  onToggle: () => void
  onPick: (tool: CanvasTool) => void
}

const TOOLS: Array<{ key: CanvasTool; label: string; icon: ReactNode }> = [
  { key: 'select', label: '선택', icon: <CursorIcon /> },
  { key: 'hand', label: '이동', icon: <HandIcon /> },
  { key: 'memo', label: '메모지', icon: <NoteIcon /> },
  { key: 'mark', label: '표시', icon: <StarIcon /> },
]

/** Right-side tools from the design. The pen tool is left out: the API has no place to store strokes. */
export function ToolPanel({ open, tool, onToggle, onPick }: ToolPanelProps) {
  if (!open) {
    return <button className="tools-reopen" type="button" aria-label="도구 창 보기" onClick={onToggle}><ChevronIcon size={11} rotate={180} />도구</button>
  }
  return (
    <div className="tool-panel" role="toolbar" aria-label="도구" aria-orientation="vertical">
      <div className="tool-panel-head">
        <span>도구</span>
        <button type="button" aria-label="도구 창 숨기기" onClick={onToggle}><ChevronIcon size={11} /></button>
      </div>
      {TOOLS.map((item) => (
        <button key={item.key} type="button" className="tool-button" aria-pressed={tool === item.key} onClick={() => onPick(item.key)}>{item.icon}{item.label}</button>
      ))}
    </div>
  )
}
