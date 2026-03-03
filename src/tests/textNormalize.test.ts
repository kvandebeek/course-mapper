import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { includesBlockedKeyword, normalizeForMatch } from '../utils/textNormalize.js';

test('normalizeForMatch trims, lowercases with stable locale, and collapses whitespace', () => {
  assert.equal(normalizeForMatch('  AI   Assisted   Documentation  '), 'ai assisted documentation');
  assert.equal(normalizeForMatch('PowerPoint Essentials'), 'powerpoint essentials');
});

test('includesBlockedKeyword performs case-insensitive substring matching', () => {
  assert.equal(includesBlockedKeyword('powerpoint essentials', ['PowerPoint']), true);
  assert.equal(includesBlockedKeyword('POWERPOINT Essentials', ['PowerPoint']), true);
  assert.equal(includesBlockedKeyword('PowerPoint Essentials', ['PowerPoint']), true);
  assert.equal(includesBlockedKeyword('TypeScript Foundations', ['PowerPoint']), false);
});
