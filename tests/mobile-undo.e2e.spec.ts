import { expect, test } from '@playwright/test';

const TIMEOUT = 30_000;

async function openMobileEditor(page: import('@playwright/test').Page) {
  await page.goto('/?mobile=1');

  const gateVisible = await page
    .getByPlaceholder('username')
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (gateVisible) {
    const runId = Date.now().toString(36);
    await page.getByPlaceholder('username').fill(`undo${runId}`.slice(0, 20));
    await page.getByPlaceholder('password').fill(`pw-${runId}-safe`);
    await page.getByRole('button', { name: 'create account' }).click();
  }

  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: TIMEOUT });
}

test('mobile undo button reverts typed text', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  await openMobileEditor(page);

  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  await editor.type('hello undo test');

  const undoButton = page.getByRole('button', { name: 'Undo' });
  await expect(undoButton).toBeVisible({ timeout: 5_000 });
  await undoButton.click({ force: true });

  await expect(editor).not.toContainText('hello undo test', { timeout: 5_000 });

  await context.close();
});
