import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { canonicalizeUrl } from '../udemy/scrapeKeyword.js';

test('canonicalizeUrl normalizes relative course URLs and strips query/hash', () => {
  const normalized = canonicalizeUrl('/course/testing-101/?couponCode=abc#section', 'https://resillion.udemy.com/organization/search/?q=test');
  assert.equal(normalized, 'https://resillion.udemy.com/course/testing-101/');
});

test('canonicalizeUrl keeps same-host absolute course URLs only', () => {
  const sameHost = canonicalizeUrl('https://resillion.udemy.com/course/typescript/?ref=search', 'https://resillion.udemy.com/organization/search/?q=ts');
  const otherHost = canonicalizeUrl('https://other.udemy.com/course/typescript/', 'https://resillion.udemy.com/organization/search/?q=ts');

  assert.equal(sameHost, 'https://resillion.udemy.com/course/typescript/');
  assert.equal(otherHost, null);
});

test('canonicalizeUrl rejects non-course and malformed URLs', () => {
  assert.equal(canonicalizeUrl('/organization/search/?q=testing', 'https://resillion.udemy.com/organization/search/?q=testing'), null);
  assert.equal(canonicalizeUrl('://bad url', 'https://resillion.udemy.com/organization/search/?q=testing'), null);
});
