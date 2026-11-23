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
