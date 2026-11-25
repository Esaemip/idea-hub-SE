export type BoardMode = 'cards' | 'groups'

interface BoardModeBarProps {
  mode: BoardMode
  analyzing: boolean
  syncing: boolean
  remoteEnabled: boolean
  onModeChange: (mode: BoardMode) => void
  onAnalyze: () => void
}

export function BoardModeBar({ mode, analyzing, syncing, remoteEnabled, onModeChange, onAnalyze }: BoardModeBarProps) {
  return (
    <nav className="board-mode-bar" aria-label="보드 보기 전환">
      <div className="mode-switch">
        <button type="button" aria-pressed={mode === 'cards'} onClick={() => onModeChange('cards')}>카드</button>
        <button type="button" aria-pressed={mode === 'groups'} onClick={() => onModeChange('groups')}>분류</button>
      </div>
      <button
        className="button analyze"
        type="button"
        aria-label={analyzing ? '아이디어 분석 중' : '아이디어 분석'}
        disabled={!remoteEnabled || analyzing || syncing}
        title={!remoteEnabled ? '서버 연결 후 사용할 수 있어요.' : syncing ? '현재 저장이 끝나면 분석할 수 있어요.' : '저장된 아이디어를 비슷한 주제로 분류합니다.'}
        onClick={onAnalyze}
      >
        {analyzing ? '분류 중…' : '✦ 분류하기'}
      </button>
    </nav>
  )
}
