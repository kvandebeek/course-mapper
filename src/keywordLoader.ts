/**
 * src/keywordLoader.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { KeywordRow, ModuleType } from './types.js';

/**
 * toRequiredString: internal utility for this module.
 */
function toRequiredString(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * toLevelCodes: internal utility for this module.
 */
function toLevelCodes(value: string | undefined): readonly string[] {
  const raw = toRequiredString(value).trim();
  if (!raw) {
    return [];
  }
  return raw.split('|').map((token) => token.trim()).filter((token) => token.length > 0);
}

/**
 * toModuleType: internal utility for this module.
 */
function toModuleType(value: string | undefined): ModuleType {
  const normalized = toRequiredString(value).trim();
  if (normalized === 'core' || normalized === 'ai' || normalized === 'softskills') {
    return normalized;
  }
  throw new Error(`Invalid moduleType in keyword row: "${normalized}"`);
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
      levelCodes: toLevelCodes(row.levelCodes),
      moduleType: toModuleType(row.moduleType),
      keyword: toRequiredString(row.keyword)
    }))
    .filter((row) => row.keyword.length > 0);
}
