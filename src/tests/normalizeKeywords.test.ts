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
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'ai', keyword: 'AI1' },
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'ai', keyword: 'AI2' },
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'core', keyword: 'Core1' },
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'core', keyword: 'Core2' },
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'softskills', keyword: 'Soft1' },
    { track: 'Path', level: 'A1', levelCodes: ['A1'], moduleType: 'softskills', keyword: 'Soft2' },
    { track: 'Path', level: 'A2', levelCodes: ['A2'], moduleType: 'ai', keyword: 'AI3' },
    { track: 'Path', level: 'A2', levelCodes: ['A2'], moduleType: 'core', keyword: 'Core3' }
  ]);
});

test('delimiter heuristic supports comma-delimited file', () => {
  const csv = [
    'Track,Level,Core Modules,AI Modules,Softskills',
    'Specialist,B2,"Core A,Core B","AI A","Soft A, Soft B"'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);

  assert.deepEqual(rows, [
    { track: 'Specialist', level: 'B2', levelCodes: ['B2'], moduleType: 'ai', keyword: 'AI A' },
    { track: 'Specialist', level: 'B2', levelCodes: ['B2'], moduleType: 'core', keyword: 'Core A' },
    { track: 'Specialist', level: 'B2', levelCodes: ['B2'], moduleType: 'core', keyword: 'Core B' },
    { track: 'Specialist', level: 'B2', levelCodes: ['B2'], moduleType: 'softskills', keyword: 'Soft A' },
    { track: 'Specialist', level: 'B2', levelCodes: ['B2'], moduleType: 'softskills', keyword: 'Soft B' }
  ]);
});

test('keyword appearing at multiple levels stores union of level codes in stable order', () => {
  const csv = [
    'Track;Level;Core Modules;AI Modules;Softskills',
    'Path;B1;"Shared";"";""',
    'Path;C1;"Shared";"";""'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);
  assert.deepEqual(rows, [
    { track: 'Path', level: 'B1', levelCodes: ['B1', 'C1'], moduleType: 'core', keyword: 'Shared' },
    { track: 'Path', level: 'C1', levelCodes: ['B1', 'C1'], moduleType: 'core', keyword: 'Shared' }
  ]);
});


test('normalization preserves Track for sample row used in scraper input', () => {
  const csv = [
    'Track,Level,Core Modules,AI Modules,Softskills',
    'Pathfinding,A1 Intern,"Introduction to Testing, Test Case Design, Exploratory Testing, Git, Intro Programming, Shadowing","Intro to AI in Testing, Prompt Engineering Basics, GenAI for Test Case Drafting, AI-Assisted Documentation","Professional Communication Basics, Active Listening, Time Management, Growth Mindset, Collaboration in Agile Teams, Basic Presentation Skills"'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);
  const target = rows.find((row) => row.keyword === 'AI-Assisted Documentation' && row.moduleType === 'ai');

  assert.ok(target);
  assert.equal(target.track, 'Pathfinding');
  assert.equal(target.level, 'A1 Intern');
});

test('supports lowercase track header and throws when first row track is missing', () => {
  const lowercaseHeaderCsv = [
    'track,Level,Core Modules,AI Modules,Softskills',
    'Pathfinding,A1 Intern,"Core 1","AI 1","Soft 1"'
  ].join('\n');

  const lowercaseRows = normalizeKeywordsFromString(lowercaseHeaderCsv);
  assert.equal(lowercaseRows[0]?.track, 'Pathfinding');

  const missingTrackCsv = [
    'Track,Level,Core Modules,AI Modules,Softskills',
    ',A1 Intern,"Core 1","AI 1","Soft 1"'
  ].join('\n');

  assert.throws(
    () => normalizeKeywordsFromString(missingTrackCsv),
    /Missing required track value at source keyword row 2\. Available keys:/
  );
});
