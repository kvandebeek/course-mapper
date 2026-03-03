import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseUdemyTotalLength } from '../udemy/extractCourseDetail.js';

test('parseUdemyTotalLength parses hours and minutes', () => {
  assert.deepEqual(parseUdemyTotalLength('14h 26m total length'), {
    hours: 14,
    minutes: 26,
    totalMinutes: 866,
    display: '14h 26m'
  });

  assert.deepEqual(parseUdemyTotalLength('2h 25m total length'), {
    hours: 2,
    minutes: 25,
    totalMinutes: 145,
    display: '2h 25m'
  });

  assert.deepEqual(parseUdemyTotalLength('38h 37m total length'), {
    hours: 38,
    minutes: 37,
    totalMinutes: 2317,
    display: '38h 37m'
  });
});

test('parseUdemyTotalLength parses minutes-only and hours-only edge cases', () => {
  assert.deepEqual(parseUdemyTotalLength('45m total length'), {
    hours: 0,
    minutes: 45,
    totalMinutes: 45,
    display: '0h 45m'
  });

  assert.deepEqual(parseUdemyTotalLength('1h total length'), {
    hours: 1,
    minutes: 0,
    totalMinutes: 60,
    display: '1h 0m'
  });
});

test('parseUdemyTotalLength returns null when duration is not parseable', () => {
  assert.equal(parseUdemyTotalLength('total length'), null);
  assert.equal(parseUdemyTotalLength(''), null);
});
