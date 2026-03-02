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

test('sleepWithJitter waits at least base + jitterMin', async () => {
  const start = performance.now();
  await sleepWithJitter(5, 10, 20);
  const elapsed = performance.now() - start;
  assert.ok(elapsed >= 12);
  assert.ok(elapsed < 80);
});

test('search url heuristics exclude known non-result endpoints', () => {
  assert.equal(isCandidateApiUrl('https://resillion.udemy.com/api-2.0/structured-data/tags/learning_path_folder/?page_size=100'), false);
  assert.equal(isCandidateApiUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2'), true);
  assert.equal(looksLikeSearchResultsUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2'), true);
  assert.equal(matchesPageForUrl('https://resillion.udemy.com/api-2.0/organization/search/?q=python&p=2', 2), true);
});
