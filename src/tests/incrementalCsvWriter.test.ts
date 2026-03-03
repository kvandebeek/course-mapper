import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createIncrementalCsvWriter, escapeCsvField } from '../io/incrementalCsvWriter.js';

test('escapeCsvField escapes quotes, commas, and newlines', () => {
  assert.equal(escapeCsvField('plain'), 'plain');
  assert.equal(escapeCsvField('contains,comma'), '"contains,comma"');
  assert.equal(escapeCsvField('quote "inner"'), '"quote ""inner"""');
  assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
});

test('incremental writer writes top courses header and appends rows across writer instances', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'incremental-csv-writer-'));
  const outputFilePath = path.join(tempDir, 'out', 'courses.csv');
  const headers = [
    'track',
    'level',
    'moduleType',
    'keyword',
    'courseInstructionalLevel',
    'courseTitle',
    'courseUrl',
    'rating',
    'ratingCount'
  ] as const;

  const writer = createIncrementalCsvWriter({ outputFilePath, headers });

  await writer.appendRow({
    track: '',
    level: 'L1',
    moduleType: 'core',
    keyword: 'alpha',
    courseInstructionalLevel: 'beginner',
    courseTitle: 'Course One',
    courseUrl: 'https://example.com/1',
    rating: 4.8,
    ratingCount: 5000
  });
  await writer.appendRow({
    track: 'Data',
    level: 'L2',
    moduleType: 'ai',
    keyword: 'beta',
    courseInstructionalLevel: 'intermediate',
    courseTitle: 'Course, Two',
    courseUrl: 'https://example.com/2',
    rating: 4.7,
    ratingCount: 2400
  });
  await writer.appendRow({
    track: 'Data',
    level: 'L3',
    moduleType: 'softskills',
    keyword: 'gamma',
    courseInstructionalLevel: 'expert',
    courseTitle: 'Course "Three"',
    courseUrl: 'https://example.com/3',
    rating: 4.6,
    ratingCount: 1501
  });

  const writerSecondRun = createIncrementalCsvWriter({ outputFilePath, headers });
  await writerSecondRun.appendRow({
    track: 'Data',
    level: 'L4',
    moduleType: 'core',
    keyword: 'delta',
    courseInstructionalLevel: 'all',
    courseTitle: 'Course Four',
    courseUrl: 'https://example.com/4',
    rating: 4.9,
    ratingCount: 9000
  });

  const content = await readFile(outputFilePath, 'utf-8');
  const lines = content.trimEnd().split('\n');

  assert.equal(
    lines[0],
    'track,level,moduleType,keyword,courseInstructionalLevel,courseTitle,courseUrl,rating,ratingCount'
  );
  assert.equal(lines.length, 5);
  assert.equal(lines[1], ',L1,core,alpha,beginner,Course One,https://example.com/1,4.8,5000');
  assert.equal(lines[2], 'Data,L2,ai,beta,intermediate,"Course, Two",https://example.com/2,4.7,2400');
  assert.equal(lines[3], 'Data,L3,softskills,gamma,expert,"Course ""Three""",https://example.com/3,4.6,1501');
  assert.equal(lines[4], 'Data,L4,core,delta,all,Course Four,https://example.com/4,4.9,9000');
});
