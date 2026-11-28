import type { Page } from '@playwright/test'

/** In-memory stand-in for the FastAPI board endpoints the screen uses (B2/B3/B5). */
export interface FakeIdea { id: number; board_id: number; text: string; group_id: number | null; assignment_is_manual: boolean; created_at: string; updated_at: string }
export interface FakeGroup { id: number; board_id: number; name: string; name_is_manual: boolean; created_at: string; updated_at: string }

const TOPICS: Array<[string, string[]]> = [['검색', ['검색', '찾', '필터']], ['화면', ['화면', '버튼', '색', '디자인']], ['저장', ['저장', '기록']]]

export const fakeApi = async (page: Page, options: { analyzeStatus?: number } = {}) => {
  const now = () => new Date().toISOString()
  const state = { title: '아이디어 허브', ideas: [] as FakeIdea[], groups: [] as FakeGroup[], nextId: 1 }
  const topicGroups = new Map<string, number>()
  const requests: Array<{ method: string; path: string; body: unknown }> = []
  const board = () => ({ id: 1, title: state.title, created_at: now(), updated_at: now(), groups: state.groups, ideas: state.ideas })

  await page.route('http://127.0.0.1:8000/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : null
    requests.push({ method, path, body })
    const idMatch = path.match(/\/ideas\/(\d+)/)
    const groupMatch = path.match(/\/groups\/(\d+)/)
    const idea = idMatch ? state.ideas.find((item) => item.id === Number(idMatch[1])) : undefined

    if (method === 'GET' && path === '/boards/1') return route.fulfill({ json: board() })
    if (method === 'POST' && path === '/boards/1/ideas') {
      const created = { id: state.nextId++, board_id: 1, text: String(body?.text), group_id: null, assignment_is_manual: false, created_at: now(), updated_at: now() }
      state.ideas.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    if (method === 'PATCH' && idea && path.endsWith('/group')) {
      Object.assign(idea, { group_id: body?.group_id ?? null, assignment_is_manual: true, updated_at: now() })
      return route.fulfill({ json: idea })
    }
    if (method === 'PATCH' && idea) { Object.assign(idea, { text: String(body?.text), updated_at: now() }); return route.fulfill({ json: idea }) }
    if (method === 'DELETE' && idea) { state.ideas = state.ideas.filter((item) => item !== idea); return route.fulfill({ status: 204, body: '' }) }
    if (method === 'POST' && path === '/boards/1/groups') {
      const group = { id: state.nextId++, board_id: 1, name: String(body?.name), name_is_manual: true, created_at: now(), updated_at: now() }
      state.groups.push(group)
      return route.fulfill({ status: 201, json: group })
    }
    if (method === 'PATCH' && groupMatch) {
      const group = state.groups.find((item) => item.id === Number(groupMatch[1]))!
      Object.assign(group, { name: String(body?.name), name_is_manual: true })
      return route.fulfill({ json: group })
    }
    if (method === 'POST' && path === '/boards/1/analyze') {
      if (options.analyzeStatus && options.analyzeStatus >= 400) return route.fulfill({ status: options.analyzeStatus, json: { detail: '분석에 실패했습니다. 잠시 후 다시 시도해 주세요.' } })
      await new Promise((resolve) => setTimeout(resolve, 400))
      // Like the real service: only memos that are not placed yet are analyzed; renamed topics keep their id.
      for (const item of state.ideas) {
        if (item.assignment_is_manual || item.group_id !== null) continue
        const topic = TOPICS.find(([, words]) => words.some((word) => item.text.includes(word)))
        if (!topic) continue
        let groupId = topicGroups.get(topic[0])
        if (groupId === undefined) {
          groupId = state.nextId++
          topicGroups.set(topic[0], groupId)
          state.groups.push({ id: groupId, board_id: 1, name: topic[0], name_is_manual: false, created_at: now(), updated_at: now() })
        }
        item.group_id = groupId
      }
      return route.fulfill({ json: board() })
    }
    return route.fulfill({ status: 404, json: { detail: 'not found' } })
  })
  return { state, requests }
}
