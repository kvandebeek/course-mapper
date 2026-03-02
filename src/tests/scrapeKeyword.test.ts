import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { canonicalizeUrl, computeEligibility } from '../udemy/scrapeKeyword.js';

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


test('computeEligibility only uses rating and ratingCount thresholds', () => {
  assert.deepEqual(computeEligibility({ rating: 4.49, ratingCount: 5000 }), {
    eligible: false,
    reason: 'rating_below_min'
  });

  assert.deepEqual(computeEligibility({ rating: 4.5, ratingCount: 1499 }), {
    eligible: false,
    reason: 'rating_count_below_min'
  });

  assert.deepEqual(computeEligibility({ rating: 4.5, ratingCount: 1500 }), {
    eligible: true,
    reason: null
  });

  assert.deepEqual(computeEligibility({ rating: null, ratingCount: null }), {
    eligible: false,
    reason: 'rating_below_min'
  });
});
