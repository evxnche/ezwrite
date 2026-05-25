import test from 'node:test';
import assert from 'node:assert/strict';

import { BUG_REPORT_EMAIL, buildBugReportMailto } from './bug-report.ts';

test('buildBugReportMailto targets the support inbox with a prefilled template', () => {
  const mailto = buildBugReportMailto({ project: 'welcome' });

  assert.ok(mailto.startsWith(`mailto:${BUG_REPORT_EMAIL}?`));
  assert.match(mailto, /subject=ezwrite\+bug\+report/);
  assert.match(mailto, /What\+happened/);
  assert.match(mailto, /project%3A\+welcome/);
});
