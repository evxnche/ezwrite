import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUG_REPORT_EMAIL,
  buildBugReportMailto,
  validateBugReportMessage,
} from './bug-report.ts';

test('validateBugReportMessage enforces length bounds', () => {
  assert.equal(validateBugReportMessage('short'), 'please add a bit more detail (10+ characters)');
  assert.equal(validateBugReportMessage('a'.repeat(4001)), 'please keep it under 4000 characters');
  assert.equal(validateBugReportMessage('  enough detail here  '), null);
});

test('buildBugReportMailto targets the support inbox with a prefilled template', () => {
  const mailto = buildBugReportMailto({ project: 'welcome' });

  assert.ok(mailto.startsWith(`mailto:${BUG_REPORT_EMAIL}?`));
  assert.match(mailto, /subject=ezwrite\+bug\+report/);
  assert.match(mailto, /What\+happened/);
  assert.match(mailto, /project%3A\+welcome/);
});
