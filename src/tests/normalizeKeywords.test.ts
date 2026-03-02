import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeKeywordsFromString } from '../keywords/normalizeKeywords.js';

test('normalizes with track carry-forward, splitting, trimming, dedupe and stable order', () => {
  const csv = [
    'Track;Level;Core Modules;AI Modules;Softskills',
    'Path;A1;"Core1; Core2; Core1";"AI1; AI2";" Soft1 ; ; Soft2 "',
    ';A2;" Core3 ";" AI3 ; AI3";""'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);

  assert.deepEqual(rows, [
    { track: 'Path', level: 'A1', moduleType: 'core', keyword: 'Core1' },
    { track: 'Path', level: 'A1', moduleType: 'core', keyword: 'Core2' },
    { track: 'Path', level: 'A1', moduleType: 'ai', keyword: 'AI1' },
    { track: 'Path', level: 'A1', moduleType: 'ai', keyword: 'AI2' },
    { track: 'Path', level: 'A1', moduleType: 'softskill', keyword: 'Soft1' },
    { track: 'Path', level: 'A1', moduleType: 'softskill', keyword: 'Soft2' },
    { track: 'Path', level: 'A2', moduleType: 'core', keyword: 'Core3' },
    { track: 'Path', level: 'A2', moduleType: 'ai', keyword: 'AI3' }
  ]);
});

test('delimiter heuristic supports comma-delimited file', () => {
  const csv = [
    'Track,Level,Core Modules,AI Modules,Softskills',
    'Specialist,B2,"Core A;Core B","AI A","Soft A; Soft B"'
  ].join('\n');

  const rows = normalizeKeywordsFromString(csv);

  assert.deepEqual(rows, [
    { track: 'Specialist', level: 'B2', moduleType: 'core', keyword: 'Core A' },
    { track: 'Specialist', level: 'B2', moduleType: 'core', keyword: 'Core B' },
    { track: 'Specialist', level: 'B2', moduleType: 'ai', keyword: 'AI A' },
    { track: 'Specialist', level: 'B2', moduleType: 'softskill', keyword: 'Soft A' },
    { track: 'Specialist', level: 'B2', moduleType: 'softskill', keyword: 'Soft B' }
  ]);
});
