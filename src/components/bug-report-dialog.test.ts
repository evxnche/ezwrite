import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BugReportDialog removes the visible what happened label and uses bright placeholders', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/BugReportDialog.tsx'), 'utf8');

  assert.equal(source.includes('children:"what happened?"'), false);
  assert.equal(source.includes('>what happened?</label>'), false);
  assert.match(source, /aria-label="what happened\?"/);
  assert.match(source, /placeholder:text-popover-foreground/);
  assert.match(source, /placeholder:opacity-100/);
  assert.match(source, /notes content is not sent/);
});

test('bug report diagnostics are installed at startup and editor state is pushed into bug context', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');
  const dialogSource = fs.readFileSync(path.join(process.cwd(), 'src/components/BugReportDialog.tsx'), 'utf8');
  const writingSource = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');

  assert.match(mainSource, /installBugReportDiagnostics\(\);/);
  assert.match(mainSource, /recordBugReportBreadcrumb\('app started'\);/);
  assert.match(dialogSource, /recordBugReportBreadcrumb\('opened bug report dialog'/);
  assert.match(dialogSource, /recordBugReportBreadcrumb\('submitted bug report'/);
  assert.match(writingSource, /setBugReportRuntimeContext\(\{/);
  assert.match(writingSource, /recordBugReportBreadcrumb\('switched page'/);
  assert.match(writingSource, /recordBugReportBreadcrumb\('switched project'/);
  assert.match(writingSource, /recordBugReportBreadcrumb\('opened settings'/);
  assert.match(writingSource, /recordBugReportBreadcrumb\('sync error'/);
  assert.match(writingSource, /activeProjectId:/);
  assert.match(writingSource, /currentPage:/);
  assert.match(writingSource, /syncStatus,/);
  assert.match(writingSource, /syncError,/);
  assert.match(writingSource, /dirHandleAttached:/);
});
