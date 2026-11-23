import type { FilterState, IdeaGroup } from '../types'

interface FilterBarProps { filter: FilterState; groups: IdeaGroup[]; resultCount: number; onChange: (filter: FilterState) => void }

export function FilterBar({ filter, groups, resultCount, onChange }: FilterBarProps) {
  const hasFilter = Boolean(filter.query || filter.groupId !== 'all' || filter.favoritesOnly)
  return (
    <section className="filter-bar" aria-label="아이디어 검색과 필터">
      <label className="search-field">
        <span className="sr-only">아이디어 검색</span><span aria-hidden="true">⌕</span>
        <input type="search" value={filter.query} onChange={(event) => onChange({ ...filter, query: event.target.value })} placeholder="아이디어 찾기" />
      </label>
      <label className="select-field">
        <span>그룹</span>
        <select value={filter.groupId} onChange={(event) => onChange({ ...filter, groupId: event.target.value })}>
          <option value="all">전체 그룹</option><option value="unclassified">미분류</option>
          {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
        </select>
      </label>
      <button className={`favorite-filter ${filter.favoritesOnly ? 'active' : ''}`} type="button" aria-pressed={filter.favoritesOnly} onClick={() => onChange({ ...filter, favoritesOnly: !filter.favoritesOnly })}>
        <span aria-hidden="true">★</span> 즐겨찾기
      </button>
      <span className="result-count" role="status">{resultCount}개 표시</span>
      {hasFilter ? <button className="text-button" type="button" onClick={() => onChange({ query: '', groupId: 'all', favoritesOnly: false })}>필터 지우기</button> : null}
    </section>
  )
}
