/**
 * src/keywords/loadNormalizedKeywords.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { FrameworkLevelCode, parseLevelCode } from '../levels/frameworkLevelMapping.js';
import { ModuleType, NormalizedKeywordRow } from './normalizeKeywords.js';

interface RawNormalizedRow {
  readonly track?: string;
  readonly level?: string;
  readonly levelCodes?: string;
  readonly moduleType?: string;
  readonly keyword?: string;
}

/**
 * parseLevelCodesField: internal utility for this module.
 */
function parseLevelCodesField(value: string | undefined): readonly FrameworkLevelCode[] {
  if (!value) {
    return [];
  }

  const codes: FrameworkLevelCode[] = [];
  for (const token of value.split('|')) {
    const parsed = parseLevelCode(token);
    if (parsed && !codes.includes(parsed)) {
      codes.push(parsed);
    }
  }
  return codes;
}

/**
 * parseModuleType: internal utility for this module.
 */
function parseModuleType(value: string, normalizedPath: string, rowNumber: number): ModuleType {
  if (value === 'core' || value === 'ai' || value === 'softskills') {
    return value;
  }

  throw new Error(
    `Invalid normalized keyword row at ${normalizedPath} row ${rowNumber}: moduleType must be one of core|ai|softskills (received "${value}")`
  );
}

/**
 * loadNormalizedKeywords: public helper used by other modules.
 */
export async function loadNormalizedKeywords(normalizedFile: string): Promise<readonly NormalizedKeywordRow[]> {
  const normalizedPath = path.resolve(normalizedFile);
  let content = '';

  try {
    content = await readFile(normalizedPath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read normalized keywords file at ${normalizedPath}: ${String(error)}`);
  }

  const rows = parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as RawNormalizedRow[];

  return rows.map((row, index): NormalizedKeywordRow => {
    const rowNumber = index + 2;
    const keyword = (row.keyword ?? '').trim();
    if (keyword.length === 0) {
      throw new Error(`Invalid normalized keyword row at ${normalizedPath} row ${rowNumber}: keyword is required`);
    }

    const moduleType = parseModuleType((row.moduleType ?? '').trim(), normalizedPath, rowNumber);

    return {
      track: (row.track ?? '').trim(),
      level: (row.level ?? '').trim(),
      levelCodes: parseLevelCodesField(row.levelCodes),
      moduleType,
      keyword
    };
  });
}
