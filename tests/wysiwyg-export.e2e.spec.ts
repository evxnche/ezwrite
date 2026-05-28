import { expect, test, type Page } from '@playwright/test';

async function readOpfsMarkdown(page: Page): Promise<Array<[string, string]>> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const found: Array<[string, string]> = [];
    async function walk(dir: any) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'file') {
          if (name.endsWith('.md')) { const f = await h.getFile(); found.push([name, await f.text()]); }
        } else { await walk(h); }
      }
    }
    await walk(root);
    return found;
  });
}

// Real-browser proof that saved Markdown mirrors the editor: the app writes its pages
// to OPFS via the same serializer used for the local folder. We type a plain line and
// a Tab-indented line, then confirm the written .md uses markdown hard breaks (two
// trailing spaces) and non-breaking-space indentation.
test('wysiwyg export: OPFS markdown mirrors editor line breaks and indentation', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'headless WebKit OPFS introspection is flaky; chromium covers the browser path');
  await page.addInitScript(() => {
    try { localStorage.setItem('ezwrite-beta-access', 'granted'); } catch { /* ignore */ }
  });
  await page.goto('/');
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible({ timeout: 30000 });

  await editor.click();
  await page.keyboard.type('ZZZmarker');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Tab');                 // editor inserts an 8-space indent
  await page.waitForTimeout(150);
  await page.keyboard.type('INDENTEDZZZ');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

  let files: Array<[string, string]> = [];
  for (let i = 0; i < 24; i++) {
    files = await readOpfsMarkdown(page);
    if (files.some(([, t]) => t.includes('INDENTEDZZZ'))) break;
    await page.waitForTimeout(500);
  }
  const markerFile = files.find(([, t]) => t.includes('INDENTEDZZZ'))?.[1] ?? '';
  const all = files.map(([, t]) => t).join('\n');
  const hardBreaks = (all.match(/  \n/g) || []).length;
  const indentedMarker = /\u00A0+INDENTEDZZZ/.test(markerFile);
  console.log('hard-break count:', hardBreaks, '| nbsp before marker:', indentedMarker, '| any nbsp:', all.includes('\u00A0'));
  console.log('marker line region:', JSON.stringify((markerFile.match(/.{0,12}INDENTEDZZZ/) || [''])[0]));

  expect(markerFile.length > 0, 'edit persisted to a page file').toBeTruthy();
  expect(hardBreaks, 'single line breaks became two-space hard breaks').toBeGreaterThanOrEqual(2);
  expect(indentedMarker, 'indented line written with non-breaking spaces').toBeTruthy();
});
