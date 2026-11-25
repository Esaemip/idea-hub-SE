import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('card CRUD, group move and reload persistence work together', async ({ page }) => {
  const composer = page.getByLabel('새 아이디어')
  await composer.fill('브라우저에서 만든 아이디어')
  await composer.press('Enter')
  await expect(page.getByRole('button', { name: '브라우저에서 만든 아이디어 수정' })).toBeVisible()

  await page.getByRole('button', { name: '브라우저에서 만든 아이디어 수정' }).click()
  await page.getByLabel('아이디어 수정').fill('수정된 브라우저 아이디어')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  const card = page.getByRole('article').filter({ hasText: '수정된 브라우저 아이디어' })
  await card.getByLabel('카드 그룹 이동').selectOption({ label: '화면 UI' })
  await expect(card.getByText('고정')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '수정된 브라우저 아이디어 수정' })).toBeVisible()
  const persistedCard = page.getByRole('article').filter({ hasText: '수정된 브라우저 아이디어' })
  await expect(persistedCard.getByLabel('카드 그룹 이동')).toHaveValue(/group-/)

  page.on('dialog', (dialog) => dialog.accept())
  await persistedCard.getByLabel('아이디어 삭제').click()
  await expect(page.getByText('수정된 브라우저 아이디어')).toHaveCount(0)
})

test('bulk input, search and favorites update immediately', async ({ page }) => {
  await page.getByRole('button', { name: '여러 개 입력' }).click()
  await page.getByLabel('아이디어 목록').fill('검색 대상 A\n검색 대상 B\n검색 대상 A')
  await expect(page.getByText('1개 중복 제외')).toBeVisible()
  await page.getByRole('button', { name: '2개 추가' }).click()

  await page.getByPlaceholder('아이디어 찾기').fill('검색 대상 A')
  await expect(page.getByText('1개 표시')).toBeVisible()
  await page.getByLabel('즐겨찾기에 추가').click()
  await page.getByRole('button', { name: '즐겨찾기', exact: true }).click()
  await expect(page.getByRole('button', { name: '검색 대상 A 수정' })).toBeVisible()
})

test('group creation and rename work on a mobile viewport', async ({ page }) => {
  await page.getByRole('button', { name: '새 그룹 만들기' }).click()
  await page.getByLabel('그룹 이름').fill('모바일 그룹')
  await page.getByRole('button', { name: '만들기' }).click()
  await page.getByLabel('모바일 그룹 이름 수정').click()
  await page.getByRole('textbox', { name: '그룹 이름', exact: true }).fill('변경된 모바일 그룹')
  await page.getByLabel('그룹 이름 저장').click()
  await expect(page.getByRole('heading', { name: '변경된 모바일 그룹' })).toBeVisible()
})

test('saved analysis and B3 manual changes survive server reloads', async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: unknown }> = []
  const board = {
    id: 1, title: '연동 보드', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z',
    groups: [{ id: 5, board_id: 1, name: 'AI 그룹', name_is_manual: false, created_at: '2026-11-25T01:00:00Z', updated_at: '2026-11-25T01:00:00Z' }],
    ideas: [
      { id: 7, board_id: 1, text: '분석 카드', group_id: 5, assignment_is_manual: false, analyzed_at: '2026-11-25T01:00:00Z', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' },
      { id: 8, board_id: 1, text: '미분류 카드', group_id: null as number | null, assignment_is_manual: false, analyzed_at: '2026-11-25T01:00:00Z', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' },
    ],
  }
  await page.route('**/boards/1**', async (route) => {
    const request = route.request()
    const url = request.url()
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : null
    requests.push({ method: request.method(), url, body })
    if (url.endsWith('/analyze')) {
      await route.fulfill({ json: board })
      return
    }
    if (url.endsWith('/groups/5')) {
      board.groups[0].name = String(body?.name)
      board.groups[0].name_is_manual = true
      await route.fulfill({ json: board.groups[0] })
      return
    }
    if (url.endsWith('/ideas/8/group')) {
      board.ideas[1].group_id = Number(body?.group_id)
      board.ideas[1].assignment_is_manual = true
      await route.fulfill({ json: board.ideas[1] })
      return
    }
    if (url.endsWith('/boards/1') && request.method() === 'GET') {
      await route.fulfill({ json: board })
      return
    }
    await route.abort()
  })

  await page.getByRole('button', { name: '아이디어 분석' }).click()
  await expect(page.getByRole('heading', { name: 'AI 그룹' })).toBeVisible()
  const unclassifiedCard = page.getByRole('article').filter({ hasText: '미분류 카드' })
  await expect(unclassifiedCard.getByLabel('카드 그룹 이동')).toHaveValue('')

  await page.getByLabel('서버에서 새로고침').click()
  await expect(page.getByRole('heading', { name: 'AI 그룹' })).toBeVisible()
  await expect(unclassifiedCard.getByLabel('카드 그룹 이동')).toHaveValue('')

  await page.getByLabel('AI 그룹 이름 수정').click()
  await page.getByRole('textbox', { name: '그룹 이름', exact: true }).fill('변경 그룹')
  await page.getByLabel('그룹 이름 저장').click()
  await unclassifiedCard.getByLabel('카드 그룹 이동').selectOption('server-group-5')
  await page.getByLabel('서버에서 새로고침').click()

  await expect(page.getByRole('heading', { name: '변경 그룹' })).toBeVisible()
  await expect(page.getByRole('article').filter({ hasText: '미분류 카드' }).getByLabel('카드 그룹 이동')).toHaveValue('server-group-5')

  await expect.poll(() => requests.filter((request) => request.method === 'PATCH').length).toBe(2)
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'POST', url: expect.stringMatching(/\/boards\/1\/analyze$/), body: {} }),
    expect.objectContaining({ method: 'PATCH', url: expect.stringMatching(/\/boards\/1\/groups\/5$/), body: { name: '변경 그룹' } }),
    expect.objectContaining({ method: 'PATCH', url: expect.stringMatching(/\/boards\/1\/ideas\/8\/group$/), body: { group_id: 5 } }),
  ]))
})
