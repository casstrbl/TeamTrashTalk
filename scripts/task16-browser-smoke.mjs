import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
try {
  await page.goto('http://127.0.0.1:4173/TeamTrashTalk/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Log in/ }).first().click()
  await page.getByLabel('Email').fill('person1@example.com')
  await page.getByLabel('Password').fill('demo')
  await page.locator('button[type=submit]').click()
  await page.getByRole('button', { name: 'Editor tools' }).click()
  await page.getByRole('heading', { name: 'Test Panel' }).waitFor()
  await page.getByText('The Java server is offline.', { exact: false }).waitFor()

  const preview = page.locator('div.grid.grid-cols-3').first()
  const level = async () => preview.getByText('Recycling', { exact: true }).locator('..').locator('span').nth(1).innerText()
  const initial = await level()
  await page.getByRole('button', { name: 'Set recycling to 85%' }).click()
  await page.getByText(/Browser simulation: fill completed/).waitFor()
  await preview.getByText('85%', { exact: true }).waitFor()
  console.log('PASS: single-bin fill updates preview')

  await page.getByRole('button', { name: 'Take sensor offline' }).click()
  await page.getByRole('button', { name: 'Sensor is offline' }).waitFor()
  console.log('PASS: taking the sensor offline updates UI')

  await page.getByRole('button', { name: 'Set recycling to 85%' }).click()
  await page.getByRole('button', { name: 'Take sensor offline' }).waitFor()
  console.log('PASS: fill returns sensor online')

  await page.getByRole('button', { name: 'Reset demo' }).click()
  await page.getByRole('button', { name: 'Tap again to reset every bin' }).click()
  await page.getByText(/Browser demo bins restored to starting levels/).waitFor()
  await preview.getByText(initial, { exact: true }).waitFor()
  console.log('PASS: reset restores original demo levels')

  await page.getByLabel('Bin to test').selectOption('__all')
  await page.getByRole('button', { name: 'Empty all bins' }).click()
  await page.getByText(/bins emptied/).waitFor()
  console.log('PASS: all-bin empty simulation succeeds')

  assert.ok((await page.getByRole('button', { name: 'Backend required' }).count()) >= 3)
  console.log('PASS: server-only actions are visibly disabled')
} catch (err) {
  await page.screenshot({ path: '/tmp/task16-smoke-failure.png', fullPage: true }).catch(() => {})
  console.error('Task 16 browser smoke FAILED:', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
