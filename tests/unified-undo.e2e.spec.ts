import { expect, test } from '@playwright/test';

const TIMEOUT = 30_000;
const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

const E2E_PROJECT_ID = 'e2e-unified-undo';

async function openEditor(page: import('@playwright/test').Page) {
  await page.addInitScript((projectId: string) => {
    try {
      const now = Date.now();
      localStorage.setItem('ezwrite-beta-access', 'granted');
      localStorage.setItem('ezwrite-cmd-arrow-pages', 'true');
      localStorage.setItem('ezwrite-welcome-rollout', '2026-05-28');
      localStorage.setItem(
        'ezwrite-projects',
        JSON.stringify([{ id: projectId, createdAt: now, updatedAt: now, title: 'undo e2e' }]),
      );
      localStorage.setItem('ezwrite-active-project', projectId);
      localStorage.setItem(`ezwrite-project-${projectId}`, JSON.stringify(['page one', 'page two']));
      localStorage.setItem(`ezwrite-project-${projectId}-bak`, JSON.stringify(['page one', 'page two']));
      localStorage.setItem(`ezwrite-project-${projectId}-ts`, JSON.stringify([now, now]));
      localStorage.setItem(`ezwrite-project-${projectId}-lp`, '0');
    } catch {
      /* ignore */
    }
  }, E2E_PROJECT_ID);
  await page.goto('/');
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: TIMEOUT });
  return editor;
}

async function pageDots(page: import('@playwright/test').Page) {
  const dots = page.getByLabel('Pages in this doc').locator('button');
  await expect(dots).toHaveCount(2, { timeout: TIMEOUT });
  return dots;
}

test('cmd/ctrl+z undoes page delete then typing in order', async ({ page }) => {
  const editor = await openEditor(page);
  const dots = await pageDots(page);

  await dots.nth(1).click();
  await editor.click();
  await page.keyboard.press(`${modKey}+a`);
  await page.keyboard.type('UNIFIEDMARKERXYZ');
  await page.waitForTimeout(400);

  const countBeforeDelete = await dots.count();
  await page.keyboard.press(`${modKey}+d`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBeforeDelete - 1, { timeout: TIMEOUT });

  await page.keyboard.press(`${modKey}+z`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBeforeDelete, { timeout: TIMEOUT });
  await expect(editor).toContainText('UNIFIEDMARKERXYZ', { timeout: TIMEOUT });

  await editor.click();
  await page.keyboard.type(' TAIL');
  await page.waitForTimeout(400);
  await expect(editor).toContainText('TAIL', { timeout: TIMEOUT });

  await page.keyboard.press(`${modKey}+z`);
  await page.waitForTimeout(500);
  await expect(editor).not.toContainText('TAIL', { timeout: TIMEOUT });
  await expect(editor).toContainText('UNIFIEDMARKERXYZ', { timeout: TIMEOUT });
});

test('typing on a page then deleting it: undo brings the page back with that text', async ({ page }) => {
  const editor = await openEditor(page);
  const dots = await pageDots(page);

  await dots.nth(1).click();
  await editor.click();
  await page.keyboard.press(`${modKey}+a`);
  await page.keyboard.type('PHRASEBEFOREDELETE');
  await page.waitForTimeout(400);

  const countBeforeDelete = await dots.count();
  await page.keyboard.press(`${modKey}+d`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBeforeDelete - 1);

  await page.keyboard.press(`${modKey}+z`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBeforeDelete);
  await expect(editor).toContainText('PHRASEBEFOREDELETE');
});

test('backspace on page 1 then delete page 2: both undos work', async ({ page }) => {
  const editor = await openEditor(page);
  const dots = await pageDots(page);

  await dots.nth(0).click();
  await editor.click();
  await page.keyboard.press(`${modKey}+a`);
  await page.keyboard.type('LONGTEXT');
  await page.waitForTimeout(600);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Backspace');
  }
  await page.waitForTimeout(400);
  await expect(editor).toContainText('LONG');

  await dots.nth(1).click();
  await page.waitForTimeout(300);
  const countBefore = await dots.count();
  await page.keyboard.press(`${modKey}+d`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBefore - 1);

  await page.keyboard.press(`${modKey}+z`);
  await page.waitForTimeout(500);
  await expect(dots).toHaveCount(countBefore);

  await page.keyboard.press(`${modKey}+z`);
  await page.waitForTimeout(500);
  await dots.nth(0).click();
  await page.waitForTimeout(300);
  await expect(editor).toContainText('LONGTEXT', { timeout: TIMEOUT });
});
