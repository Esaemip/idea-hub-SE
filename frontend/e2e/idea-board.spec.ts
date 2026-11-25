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

test('analysis preview is rendered and only persisted groups use B3 APIs', async ({ page }) => {
  const requests: Array<{ method: string; url: string; body: unknown }> = []
  await page.route('**/boards/1**', async (route) => {
    const request = route.request()
    const url = request.url()
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : null
    requests.push({ method: request.method(), url, body })
    if (url.endsWith('/analyze')) {
      await route.fulfill({ json: {
        id: 1, title: '연동 보드', created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z',
        groups: [
          { id: 4, board_id: 1, name: '저장 그룹', name_is_manual: false, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T00:00:00Z' },
          { id: -1, board_id: 1, name: '예시 그룹', name_is_manual: false, created_at: '2026-11-25T01:00:00Z', updated_at: '2026-11-25T01:00:00Z' },
        ],
        ideas: [
          { id: 7, board_id: 1, text: '미리보기 카드', group_id: -1, assignment_is_manual: false, analyzed_at: null, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T00:00:00Z' },
          { id: 8, board_id: 1, text: '저장 카드', group_id: 4, assignment_is_manual: true, analyzed_at: null, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T00:00:00Z' },
        ],
      } })
      return
    }
    if (url.endsWith('/groups/4')) {
      await route.fulfill({ json: { id: 4, board_id: 1, name: body?.name, name_is_manual: true, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' } })
      return
    }
    if (url.endsWith('/ideas/8/group')) {
      await route.fulfill({ json: { id: 8, board_id: 1, text: '저장 카드', group_id: null, assignment_is_manual: true, analyzed_at: null, created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z' } })
      return
    }
    await route.abort()
  })

  await page.getByRole('button', { name: '아이디어 분석' }).click()
  await expect(page.getByRole('heading', { name: /예시 그룹/ })).toBeVisible()
  await expect(page.getByText('분석 미리보기')).toBeVisible()
  const previewCard = page.getByRole('article').filter({ hasText: '미리보기 카드' })
  await expect(previewCard.getByLabel('카드 그룹 이동')).toBeDisabled()
  await expect(page.getByLabel('예시 그룹 이름 수정')).toHaveCount(0)

  await page.getByLabel('저장 그룹 이름 수정').click()
  await page.getByRole('textbox', { name: '그룹 이름', exact: true }).fill('변경 그룹')
  await page.getByLabel('그룹 이름 저장').click()
  const savedCard = page.getByRole('article').filter({ hasText: '저장 카드' })
  await savedCard.getByLabel('카드 그룹 이동').selectOption('')

  await expect.poll(() => requests.filter((request) => request.method === 'PATCH').length).toBe(2)
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'POST', url: expect.stringMatching(/\/boards\/1\/analyze$/), body: null }),
    expect.objectContaining({ method: 'PATCH', url: expect.stringMatching(/\/boards\/1\/groups\/4$/), body: { name: '변경 그룹' } }),
    expect.objectContaining({ method: 'PATCH', url: expect.stringMatching(/\/boards\/1\/ideas\/8\/group$/), body: { group_id: null } }),
  ]))
  expect(requests.some((request) => /groups\/-1|ideas\/7\/group/.test(request.url))).toBe(false)
})
