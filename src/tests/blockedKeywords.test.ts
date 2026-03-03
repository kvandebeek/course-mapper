import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isBlockedByKeyword } from '../udemy/blockedKeywords.js';

test('isBlockedByKeyword matches blocked keywords case-insensitively after trim', () => {
  assert.deepEqual(isBlockedByKeyword('  aws certified solutions architect  '), {
    blocked: true,
    matched: 'AWS',
    matchedNormalized: 'aws'
  });
  assert.deepEqual(isBlockedByKeyword('Google Cloud Professional Data Engineer'), {
    blocked: true,
    matched: 'Google Cloud',
    matchedNormalized: 'google cloud'
  });
});

test('isBlockedByKeyword matches PowerPoint variants regardless of title casing', () => {
  assert.equal(isBlockedByKeyword('powerpoint essentials').blocked, true);
  assert.equal(isBlockedByKeyword('POWERPOINT Essentials').blocked, true);
  assert.equal(isBlockedByKeyword('PowerPoint Essentials').blocked, true);
});

test('isBlockedByKeyword allows titles without blocked keyword matches', () => {
  assert.deepEqual(isBlockedByKeyword('Software Testing for Beginners'), { blocked: false });
  assert.deepEqual(isBlockedByKeyword('   '), { blocked: false });
});
