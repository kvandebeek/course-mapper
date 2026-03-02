/**
 * src/tests/normalizeKeywords.test.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeKeywordsFromString, splitAndCleanKeywordCell } from '../keywords/normalizeKeywords.js';

test('splitAndCleanKeywordCell splits comma-separated values and normalizes spacing', () => {
  assert.deepEqual(splitAndCleanKeywordCell(' Introduction to Testing, Test\u00A0Case   Design, , Exploratory   Testing '), [
    'Introduction to Testing',
    'Test Case Design',
    'Exploratory Testing'
  ]);
});

test('normalizes with track carry-forward, splitting, trimming, dedupe and stable order', () => {
  const csv = [
    'Track;Level;Core Modules;AI Modules;Softskills',
    'Path;A1;"Core1, Core2, Core1";"AI1, AI2";" Soft1 , , Soft2 "',
    ';A2;" Core3 ";" AI3 , AI3";""'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);

  assert.deepEqual(rows, [
    { track: 'Path', level: 'A1', moduleType: 'ai', keyword: 'AI1' },
    { track: 'Path', level: 'A1', moduleType: 'ai', keyword: 'AI2' },
    { track: 'Path', level: 'A1', moduleType: 'core', keyword: 'Core1' },
    { track: 'Path', level: 'A1', moduleType: 'core', keyword: 'Core2' },
    { track: 'Path', level: 'A1', moduleType: 'softskills', keyword: 'Soft1' },
    { track: 'Path', level: 'A1', moduleType: 'softskills', keyword: 'Soft2' },
    { track: 'Path', level: 'A2', moduleType: 'ai', keyword: 'AI3' },
    { track: 'Path', level: 'A2', moduleType: 'core', keyword: 'Core3' }
  ]);
});

test('delimiter heuristic supports comma-delimited file', () => {
  const csv = [
    'Track,Level,Core Modules,AI Modules,Softskills',
    'Specialist,B2,"Core A,Core B","AI A","Soft A, Soft B"'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);

  assert.deepEqual(rows, [
    { track: 'Specialist', level: 'B2', moduleType: 'ai', keyword: 'AI A' },
    { track: 'Specialist', level: 'B2', moduleType: 'core', keyword: 'Core A' },
    { track: 'Specialist', level: 'B2', moduleType: 'core', keyword: 'Core B' },
    { track: 'Specialist', level: 'B2', moduleType: 'softskills', keyword: 'Soft A' },
    { track: 'Specialist', level: 'B2', moduleType: 'softskills', keyword: 'Soft B' }
  ]);
});
