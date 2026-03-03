/**
 * src/tests/scrapeKeyword.test.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { REJECTION_REASON, canonicalizeUrl, computeEligibility } from '../udemy/scrapeKeyword.js';
import { buildSearchUrl } from '../udemy/navigation.js';

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

test('computeEligibility accepts missing detail level when search already constrained instructional levels', () => {
  assert.deepEqual(
    computeEligibility({
      rating: 4.8,
      ratingCount: 5000,
      allowedInstructionalLevels: ['beginner'],
      udemyLevel: null,
      eligibilityContext: {
        requestedInstructionalLevels: ['beginner']
      }
    }),
    {
      eligible: true,
      reason: null,
      acceptedDueToSearchLevelFiltering: true
    }
  );
});

test('computeEligibility accepts known allowed instructional level when constrained', () => {
  assert.deepEqual(
    computeEligibility({
      rating: 4.8,
      ratingCount: 5000,
      allowedInstructionalLevels: ['beginner', 'intermediate'],
      udemyLevel: 'Intermediate Level',
      eligibilityContext: {
        requestedInstructionalLevels: ['beginner', 'intermediate']
      }
    }),
    {
      eligible: true,
      reason: null
    }
  );
});

test('computeEligibility rejects known disallowed instructional level when constrained', () => {
  assert.deepEqual(
    computeEligibility({
      rating: 4.8,
      ratingCount: 5000,
      allowedInstructionalLevels: ['beginner'],
      udemyLevel: 'Expert',
      eligibilityContext: {
        requestedInstructionalLevels: ['beginner']
      }
    }),
    {
      eligible: false,
      reason: REJECTION_REASON.INSTRUCTIONAL_LEVEL_NOT_ALLOWED
    }
  );
});

test('computeEligibility still rejects unknown level when no search-level filter context is available', () => {
  assert.deepEqual(
    computeEligibility({
      rating: 4.8,
      ratingCount: 5000,
      allowedInstructionalLevels: ['beginner'],
      udemyLevel: null
    }),
    {
      eligible: false,
      reason: REJECTION_REASON.MISSING_OR_UNKNOWN_INSTRUCTIONAL_LEVEL
    }
  );
});



test('buildSearchUrl rounds minRating down to one decimal for ratings param', () => {
  const url = buildSearchUrl('python', {
    minRating: 4.64
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ratings'), '4.6');
});

test('buildSearchUrl rounds minRating up to one decimal for ratings param', () => {
  const url = buildSearchUrl('python', {
    minRating: 4.65
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('ratings'), '4.7');
});

test('buildSearchUrl appends kw when provided', () => {
  const url = buildSearchUrl('qa automation', {
    kw: 'qa'
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('kw'), 'qa');
});

test('buildSearchUrl appends multiple instructional_level params', () => {
  const url = buildSearchUrl('python', {
    minRating: 4.6,
    lang: 'en',
    instructionalLevels: ['beginner', 'intermediate'],
    sort: 'relevance'
  });

  const parsed = new URL(url);
  assert.deepEqual(parsed.searchParams.getAll('instructional_level'), ['beginner', 'intermediate']);
});


test('buildSearchUrl includes kw with repeated duration and instructional_level params', () => {
  const url = buildSearchUrl('python', {
    minRating: 4.6,
    kw: 'qa',
    lang: 'en',
    instructionalLevels: ['beginner', 'intermediate'],
    durations: ['extraShort', 'medium', 'long'],
    sort: 'relevance'
  });

  const parsed = new URL(url);
  assert.deepEqual(parsed.searchParams.getAll('duration'), ['extraShort', 'medium', 'long']);
  assert.deepEqual(parsed.searchParams.getAll('instructional_level'), ['beginner', 'intermediate']);
  assert.equal(parsed.searchParams.get('kw'), 'qa');
  assert.equal(parsed.searchParams.get('sort'), 'relevance');
  assert.equal(url, 'https://resillion.udemy.com/organization/search/?src=ukw&q=python&ratings=4.6&kw=qa&lang=en&instructional_level=beginner&instructional_level=intermediate&duration=extraShort&duration=medium&duration=long&sort=relevance');
});
