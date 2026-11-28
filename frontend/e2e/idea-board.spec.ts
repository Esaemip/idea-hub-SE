import { expect, test, type Page } from '@playwright/test'
import { fakeApi } from './fake-api'

const draft = (page: Page) => page.getByLabel('새 메모')
const note = (page: Page, text: string) => page.getByRole('button', { name: text, exact: true })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: '선택한 메모 도구' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('write on an empty board, edit, delete and keep it after a reload', async ({ page }) => {
  const api = await fakeApi(page)
  await page.reload()

  await expect(page.getByLabel('빈 아이디어 보드')).toBeVisible()
  await expect(draft(page)).toBeFocused()
  await page.keyboard.type('메인 화면은 심플하게')
  await page.keyboard.press('Enter')
  await page.keyboard.type('검색 결과를 강조하기')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('찾은 낱말에 색 칠하기')
  await page.keyboard.press('Enter')
  await expect(note(page, '메인 화면은 심플하게')).toBeVisible()
  await expect(note(page, '검색 결과를 강조하기\n찾은 낱말에 색 칠하기')).toBeVisible()
  await expect(draft(page)).toBeFocused()

  await note(page, '메인 화면은 심플하게').dblclick()
  await page.getByLabel('메모 고치기').fill('메인 화면은 더 심플하게')
  await page.keyboard.press('Enter')
  await expect(note(page, '메인 화면은 더 심플하게')).toBeVisible()

  page.on('dialog', (dialog) => dialog.accept())
  await note(page, '검색 결과를 강조하기\n찾은 낱말에 색 칠하기').click()
  await toolbar(page).getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('찾은 낱말에 색 칠하기')).toHaveCount(0)

  await expect.poll(() => api.state.ideas.map((idea) => idea.text)).toEqual(['메인 화면은 더 심플하게'])
  await page.reload()
  await expect(note(page, '메인 화면은 더 심플하게')).toBeVisible()
})

test('double-click writes where the canvas was clicked and the spot is kept', async ({ page, isMobile }) => {
  test.skip(isMobile, 'double-click placement is a mouse interaction')
  await fakeApi(page)
  await page.reload()
  await expect(draft(page)).toBeFocused()
  await page.keyboard.press('Escape')

  const canvas = page.getByRole('region', { name: '메모 캔버스' })
  const box = (await canvas.boundingBox())!
  await page.mouse.dblclick(box.x + 700 * 0.7, box.y + 500 * 0.7)
  await expect(draft(page)).toBeFocused()
  await page.keyboard.type('여기에 바로 적기')
  await page.keyboard.press('Enter')
  const placed = page.locator('[data-idea-id]').filter({ hasText: '여기에 바로 적기' })
  await expect(placed).toHaveCSS('left', '692px')
  await expect(placed).toHaveCSS('top', '480px')

  await page.reload()
  await expect(page.locator('[data-idea-id]').filter({ hasText: '여기에 바로 적기' })).toHaveCSS('left', '692px')
})

test('classify, rename a topic, move cards and keep the changes after a reload', async ({ page, isMobile }) => {
  const api = await fakeApi(page)
  await page.reload()
  await expect(draft(page)).toBeFocused()
  for (const text of ['버튼은 아이콘으로', '주제마다 색을 다르게', '검색 기능 추가', '적자마자 저장', '발표 날짜 확인']) {
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await expect.poll(() => api.state.ideas.length).toBe(5)

  await page.getByRole('button', { name: '분류하기' }).click()
  await expect(page.getByText('비슷한 메모끼리 묶는 중이에요')).toBeVisible()
  await expect(page.getByRole('region', { name: '주제별 분류' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '화면' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '미분류' })).toBeVisible()

  await page.getByRole('button', { name: '화면 이름 고치기' }).click()
  await page.getByLabel('주제 이름').fill('화면 UI')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('heading', { name: '화면 UI' })).toBeVisible()

  await note(page, '발표 날짜 확인').click()
  await toolbar(page).getByRole('button', { name: '화면 UI' }).click()
  await expect(page.getByRole('heading', { name: '미분류' })).toHaveCount(0)

  if (!isMobile) {
    await page.waitForTimeout(800) // let the moved note finish sliding into its row
    const target = page.getByRole('region', { name: '주제별 분류' })
    await page.locator('[data-idea-id]').filter({ hasText: '검색 기능 추가' }).dragTo(target, { targetPosition: { x: 300 * 0.7, y: 140 * 0.7 } })
    await expect.poll(() => api.state.ideas.find((idea) => idea.text === '검색 기능 추가')?.assignment_is_manual).toBe(true)
  }

  await page.reload()
  await page.getByRole('tab', { name: '분류' }).click()
  await expect(page.getByRole('heading', { name: '화면 UI' })).toBeVisible()
  await expect(note(page, '발표 날짜 확인').getByText('고정')).toBeVisible()
  const screenGroup = api.state.groups.find((group) => group.name === '화면 UI')!
  expect(screenGroup.name_is_manual).toBe(true)
  expect(api.state.ideas.find((idea) => idea.text === '발표 날짜 확인')).toMatchObject({ group_id: screenGroup.id, assignment_is_manual: true })
  expect(api.requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'POST', path: '/boards/1/analyze', body: {} }),
    expect.objectContaining({ method: 'PATCH', path: `/boards/1/groups/${screenGroup.id}`, body: { name: '화면 UI' } }),
  ]))
})

test('a failed analysis keeps the board and offers a retry', async ({ page }) => {
  const api = await fakeApi(page, { analyzeStatus: 503 })
  await page.reload()
  await expect(draft(page)).toBeFocused()
  await page.keyboard.type('그대로 남을 메모')
  await page.keyboard.press('Enter')
  await expect.poll(() => api.state.ideas.length).toBe(1)

  await page.getByRole('button', { name: '분류하기' }).click()
  const alert = page.getByRole('alert').filter({ hasText: '분류하지 못했어요' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  await expect(note(page, '그대로 남을 메모')).toBeVisible()
  await expect(page.getByRole('tab', { name: '카드' })).toHaveAttribute('aria-selected', 'true')
})

test('bulk input and search highlight memos', async ({ page, isMobile }) => {
  await fakeApi(page)
  await page.reload()
  if (isMobile) await page.getByRole('button', { name: '메뉴 보기' }).click()
  await page.getByRole('button', { name: '여러 개 입력' }).click()
  await page.getByLabel('아이디어 목록').fill('검색 대상 A\n검색 대상 B\n검색 대상 A')
  await expect(page.getByText('1개 중복 제외')).toBeVisible()
  await page.getByRole('button', { name: '2개 추가' }).click()
  if (isMobile) await page.getByRole('button', { name: '메뉴 숨기기' }).click()

  await page.getByRole('button', { name: '메모 찾기' }).click()
  await page.getByLabel('메모 찾기').fill('대상 B')
  await expect(page.getByText('메모 1개 찾음')).toBeVisible()
  await page.getByLabel('메모 찾기').fill('없는 낱말')
  await expect(page.getByText('‘없는 낱말’와 맞는 메모가 없어요')).toBeVisible()
})
