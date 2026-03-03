import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadNormalizedKeywords } from '../keywords/loadNormalizedKeywords.js';

test('loadNormalizedKeywords returns keyword row objects including metadata', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'normalized-keyword-loader-'));
  const filePath = path.join(tempDir, 'keywords.normalized.csv');

  await writeFile(
    filePath,
    [
      'track,level,levelCodes,moduleType,keyword',
      ',L1,B1|C1,core,Intro to Testing'
    ].join('\n'),
    'utf-8'
  );

  const rows = await loadNormalizedKeywords(filePath);

  assert.deepEqual(rows, [
    {
      track: '',
      level: 'L1',
      levelCodes: ['B1', 'C1'],
      moduleType: 'core',
      keyword: 'Intro to Testing'
    }
  ]);
});

test('loadNormalizedKeywords fails fast with row number for malformed rows', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'normalized-keyword-loader-'));
  const filePath = path.join(tempDir, 'keywords.normalized.csv');

  await writeFile(
    filePath,
    [
      'track,level,levelCodes,moduleType,keyword',
      'Track A,L1,B1,invalid,Intro to Testing'
    ].join('\n'),
    'utf-8'
  );

  await assert.rejects(
    async () => loadNormalizedKeywords(filePath),
    /Invalid normalized keyword row.*row 2.*moduleType must be one of core\|ai\|softskills/
  );
});
