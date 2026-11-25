import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { AddGroupForm } from './components/AddGroupForm'
import { AppHeader } from './components/AppHeader'
import { BoardModeBar, type BoardMode } from './components/BoardModeBar'
import { BulkInputDialog } from './components/BulkInputDialog'
import { FilterBar } from './components/FilterBar'
import { GroupColumn } from './components/GroupColumn'
import { IdeaCard } from './components/IdeaCard'
import { IdeaComposer } from './components/IdeaComposer'
import { filterIdeas } from './domain/board'
import { useIdeaBoard } from './hooks/useIdeaBoard'
import type { FilterState } from './types'

const initialFilter: FilterState = { query: '', groupId: 'all', favoritesOnly: false }

export default function App() {
  const controller = useIdeaBoard()
  const {
    addGroup,
    addIdeas,
    analyzeBoard,
    board,
    deleteIdea,
    moveIdea,
    reloadRemote: loadRemoteBoard,
    renameGroup,
    toggleFavorite,
    updateIdea,
  } = controller
  const [filter, setFilter] = useState<FilterState>(initialFilter)
  const [mode, setMode] = useState<BoardMode>('cards')
  const [bulkOpen, setBulkOpen] = useState(false)
  const hasActiveFilter = Boolean(filter.query || filter.groupId !== 'all' || filter.favoritesOnly)
  const deferredQuery = useDeferredValue(filter.query)
  const deferredFilter = useMemo(() => ({ ...filter, query: deferredQuery }), [filter, deferredQuery])
  const visibleIdeas = useMemo(() => filterIdeas(board.ideas, deferredFilter), [board.ideas, deferredFilter])
  const ideasByGroup = useMemo(() => {
    const result = new Map<string | null, typeof visibleIdeas>()
    for (const idea of visibleIdeas) result.set(idea.groupId, [...(result.get(idea.groupId) ?? []), idea])
    return result
  }, [visibleIdeas])
  const dropIdea = useCallback(async (ideaId: string, groupId: string | null) => {
    const idea = board.ideas.find((item) => item.id === ideaId)
    if (idea && idea.groupId !== groupId) await moveIdea(idea, groupId)
  }, [board.ideas, moveIdea])
  const closeBulk = useCallback(() => setBulkOpen(false), [])
  const openBulk = useCallback(() => setBulkOpen(true), [])
  const addIdea = useCallback((text: string) => addIdeas([text]), [addIdeas])
  const reloadRemote = useCallback(() => { void loadRemoteBoard() }, [loadRemoteBoard])
  const analyze = useCallback(async () => {
    if (await analyzeBoard()) setMode('groups')
  }, [analyzeBoard])

  const columnProps = {
    groups: board.groups,
    onUpdate: updateIdea,
    onDelete: deleteIdea,
    onFavorite: toggleFavorite,
    onMove: moveIdea,
    onDropIdea: dropIdea,
    onRename: renameGroup,
    locked: controller.analyzing,
  }

  return (
    <div className="app-shell">
      <AppHeader title={board.title} ideaCount={board.ideas.length} groupCount={board.groups.length} syncState={controller.syncState} syncMessage={controller.syncMessage} remoteEnabled={controller.remoteEnabled} onReload={reloadRemote} />
      <main>
        <BoardModeBar mode={mode} analyzing={controller.analyzing} syncing={controller.syncState === 'syncing'} remoteEnabled={controller.remoteEnabled} onModeChange={setMode} onAnalyze={() => void analyze()} />
        <IdeaComposer onAdd={addIdea} onOpenBulk={openBulk} analyzing={controller.analyzing} />
        <FilterBar filter={filter} groups={board.groups} resultCount={visibleIdeas.length} onChange={setFilter} />
        {visibleIdeas.length === 0 && hasActiveFilter ? (
          <section className="no-results" role="status"><span aria-hidden="true">⌕</span><h2>조건에 맞는 아이디어가 없어요</h2><p>검색어나 필터를 바꾸거나 새로운 아이디어를 추가해 보세요.</p><button className="button secondary" type="button" onClick={() => setFilter(initialFilter)}>필터 지우기</button></section>
        ) : mode === 'cards' ? (
          visibleIdeas.length ? <div className="card-board" aria-label="아이디어 카드 보드">
            {visibleIdeas.map((idea) => <IdeaCard key={idea.id} idea={idea} groups={board.groups} interactionLocked={controller.analyzing} dragEnabled={false} onUpdate={updateIdea} onDelete={deleteIdea} onFavorite={toggleFavorite} onMove={moveIdea} />)}
          </div> : <section className="empty-board" aria-label="빈 아이디어 보드"><span aria-hidden="true">♧</span><h2>생각나는 대로 바로 적어 보세요</h2><p>위 입력란에 적고 Enter를 누르면 메모지가 붙어요.</p></section>
        ) : (
          <div className="board-grid classified" aria-label="아이디어 그룹 보드">
            <GroupColumn group={null} ideas={ideasByGroup.get(null) ?? []} {...columnProps} />
            {board.groups.map((group) => <GroupColumn key={group.id} group={group} ideas={ideasByGroup.get(group.id) ?? []} {...columnProps} />)}
            {filter.groupId === 'all' && !controller.analyzing ? <AddGroupForm onAdd={addGroup} /> : null}
          </div>
        )}
        {controller.syncState !== 'local' ? <p className={`sync-message ${controller.syncState === 'error' ? 'error' : ''}`} role={controller.syncState === 'error' ? 'alert' : 'status'}>{controller.syncMessage}</p> : null}
      </main>
      <BulkInputDialog open={bulkOpen} existing={board.ideas} onClose={closeBulk} onAdd={addIdeas} />
    </div>
  )
}
