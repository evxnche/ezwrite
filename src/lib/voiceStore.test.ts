import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { extractVoiceIdsFromContent, voiceMimeToExt } from './voiceStore.ts';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

test('extractVoiceIdsFromContent collects ids from voice lines', () => {
  const ids = extractVoiceIdsFromContent([
    'hello',
    'voice::abc123|memo|45',
    'voice::xyz|',
    'polaroid::img1|',
  ]);
  assert.deepEqual([...ids].sort(), ['abc123', 'xyz']);
});

test('extractVoiceIdsFromContent ignores empty content', () => {
  assert.equal(extractVoiceIdsFromContent(['', '\n']).size, 0);
});

test('voiceMimeToExt maps common audio types', () => {
  assert.equal(voiceMimeToExt('audio/webm;codecs=opus'), 'webm');
  assert.equal(voiceMimeToExt('audio/mp4'), 'm4a');
  assert.equal(voiceMimeToExt('audio/ogg'), 'ogg');
});

test('voiceStore persists blobs in IndexedDB', () => {
  const source = read('src/lib/voiceStore.ts');
  assert.match(source, /const DB_NAME = 'ezwrite-voice'/);
  assert.match(source, /indexedDB\.open\(/);
  assert.match(source, /export async function saveVoice/);
  assert.match(source, /export async function loadVoice/);
  assert.match(source, /export async function gcOrphanVoices/);
});
