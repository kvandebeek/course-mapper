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
 * isModuleType: internal utility for this module.
 */
function isModuleType(value: string): value is ModuleType {
  return value === 'core' || value === 'ai' || value === 'softskills';
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

  return rows
    .map((row): NormalizedKeywordRow | null => {
      const moduleType = (row.moduleType ?? '').trim();
      if (!isModuleType(moduleType)) {
        return null;
      }
      const keyword = (row.keyword ?? '').trim();
      if (keyword.length === 0) {
        return null;
      }
      return {
        track: (row.track ?? '').trim(),
        level: (row.level ?? '').trim(),
        levelCodes: parseLevelCodesField(row.levelCodes),
        moduleType,
        keyword
      };
    })
    .filter((row): row is NormalizedKeywordRow => row !== null);
}
