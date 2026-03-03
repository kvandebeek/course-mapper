import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { scoreCourseForCareerLevel } from '../scoring/courseScorer.js';

test('scoring prefers exact target level over lower-distance options', () => {
  const exact = scoreCourseForCareerLevel('C2', {
    rating: 4.7,
    ratingCount: 5_000,
    instructionalLevel: 'expert',
    courseUrl: 'https://resillion.udemy.com/course/exact/',
    courseTitle: 'Exact'
  });

  const distanceOne = scoreCourseForCareerLevel('C2', {
    rating: 4.7,
    ratingCount: 5_000,
    instructionalLevel: 'intermediate',
    courseUrl: 'https://resillion.udemy.com/course/one/',
    courseTitle: 'One'
  });

  assert.equal(exact.isRejected, false);
  assert.equal(distanceOne.isRejected, false);
  assert.ok(exact.score > distanceOne.score);
});

test('scoring gives higher points for higher ratingCount at same rating/fit', () => {
  const lowPopularity = scoreCourseForCareerLevel('B2', {
    rating: 4.8,
    ratingCount: 100,
    instructionalLevel: 'intermediate',
    courseUrl: 'https://resillion.udemy.com/course/low/',
    courseTitle: 'Low'
  });

  const highPopularity = scoreCourseForCareerLevel('B2', {
    rating: 4.8,
    ratingCount: 20_000,
    instructionalLevel: 'intermediate',
    courseUrl: 'https://resillion.udemy.com/course/high/',
    courseTitle: 'High'
  });

  assert.ok(highPopularity.score > lowPopularity.score);
});

test('scoring rejects out-of-allowed instructional levels by default', () => {
  const rejected = scoreCourseForCareerLevel('A1', {
    rating: 4.9,
    ratingCount: 20_000,
    instructionalLevel: 'expert',
    courseUrl: 'https://resillion.udemy.com/course/rejected/',
    courseTitle: 'Rejected'
  });

  assert.equal(rejected.isRejected, true);
  assert.equal(rejected.score, 0);
});
