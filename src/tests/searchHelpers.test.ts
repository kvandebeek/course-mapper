/**
 * src/tests/searchHelpers.test.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { sleepWithJitter, shouldStopPagination } from '../searchScraper.js';
import { isCandidateApiUrl, looksLikeSearchResultsUrl, matchesPageForUrl } from '../udemy/searchTransport.js';

test('shouldStopPagination stops when unique total does not increase', () => {
  assert.equal(shouldStopPagination(27, 27), true);
  assert.equal(shouldStopPagination(27, 26), true);
  assert.equal(shouldStopPagination(27, 30), false);
});

test('sleepWithJitter uses deterministic midpoint delay', async () => {
  const start = performance.now();
  await sleepWithJitter(2, 5, 10);
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 18);
  assert.ok(elapsed < 70);
});

test('search url heuristics exclude known non-result endpoints', () => {
  assert.equal(isCandidateApiUrl('https://resillion.udemy.com/api-2.0/structured-data/tags/learning_path_folder/?page_size=100'), false);
  assert.equal(isCandidateApiUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2'), true);
  assert.equal(looksLikeSearchResultsUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2'), true);
  assert.equal(matchesPageForUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2', 2), true);
});
