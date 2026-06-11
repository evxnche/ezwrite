import test from 'node:test';
import assert from 'node:assert/strict';

import { isBlockedIp } from './ssrf-guard.ts';

test('blocks loopback', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true);
  assert.equal(isBlockedIp('127.5.5.5'), true);
  assert.equal(isBlockedIp('::1'), true);
});

test('blocks cloud metadata + link-local', () => {
  assert.equal(isBlockedIp('169.254.169.254'), true);
  assert.equal(isBlockedIp('169.254.0.1'), true);
  assert.equal(isBlockedIp('fe80::1'), true);
});

test('blocks RFC1918 private ranges', () => {
  assert.equal(isBlockedIp('10.0.0.5'), true);
  assert.equal(isBlockedIp('172.16.0.1'), true);
  assert.equal(isBlockedIp('172.31.255.255'), true);
  assert.equal(isBlockedIp('192.168.1.1'), true);
});

test('blocks CGNAT, unspecified, multicast, reserved', () => {
  assert.equal(isBlockedIp('100.64.0.1'), true);
  assert.equal(isBlockedIp('0.0.0.0'), true);
  assert.equal(isBlockedIp('224.0.0.1'), true);
  assert.equal(isBlockedIp('::'), true);
});

test('blocks ULA and IPv4-mapped private', () => {
  assert.equal(isBlockedIp('fd00::1'), true);
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIp('::ffff:10.0.0.1'), true);
});

test('allows normal public addresses', () => {
  assert.equal(isBlockedIp('1.1.1.1'), false);
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedIp('93.184.216.34'), false); // example.com
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false); // cloudflare v6
  assert.equal(isBlockedIp('172.32.0.1'), false); // just outside 172.16/12
});
