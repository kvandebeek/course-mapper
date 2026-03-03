/**
 * src/keywordLoader.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { KeywordRow } from './types.js';

/**
 * toRequiredString: internal utility for this module.
 */
function toRequiredString(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * loadKeywords: public helper used by other modules.
 */
export async function loadKeywords(path: string): Promise<KeywordRow[]> {
  const content = await readFile(path, 'utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string | undefined>[];

  return rows
    .map((row): KeywordRow => ({
      track: toRequiredString(row.track),
      level: toRequiredString(row.level),
      levelCodes: toRequiredString(row.levelCodes),
      moduleType: toRequiredString(row.moduleType),
      keyword: toRequiredString(row.keyword)
    }))
    .filter((row) => row.keyword.length > 0);
}
