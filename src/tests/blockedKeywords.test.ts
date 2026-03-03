import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isBlockedByKeyword } from '../udemy/blockedKeywords.js';

test('isBlockedByKeyword matches blocked keywords case-insensitively after trim', () => {
  assert.deepEqual(isBlockedByKeyword('  aws certified solutions architect  '), {
    blocked: true,
    matched: 'AWS'
  });
  assert.deepEqual(isBlockedByKeyword('Google Cloud Professional Data Engineer'), {
    blocked: true,
    matched: 'Google Cloud'
  });
});

test('isBlockedByKeyword allows titles without blocked keyword matches', () => {
  assert.deepEqual(isBlockedByKeyword('TypeScript for Beginners'), { blocked: false });
  assert.deepEqual(isBlockedByKeyword('   '), { blocked: false });
});
