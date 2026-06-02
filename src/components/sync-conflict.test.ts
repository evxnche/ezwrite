import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WritingInterface skips conflict copies when local and remote notebook content hashes match', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');

  assert.match(source, /const remoteHash = await hashSnapshot\(snapshot\);/);
  assert.match(source, /const localHash = await hashSnapshot\(localSnapshot\);/);
  assert.match(source, /if \(localHash === remoteHash\) \{[\s\S]*?markProjectSynced\(projectId, row\.updated_at, local\.updatedAt, remoteHash\);[\s\S]*?continue;/);
});
