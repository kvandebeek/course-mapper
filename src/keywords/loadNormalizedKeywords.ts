import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { ModuleType, NormalizedKeywordRow } from './normalizeKeywords.js';

interface RawNormalizedRow {
  readonly track?: string;
  readonly level?: string;
  readonly moduleType?: string;
  readonly keyword?: string;
}

function isModuleType(value: string): value is ModuleType {
  return value === 'core' || value === 'ai' || value === 'softskill';
}

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
        moduleType,
        keyword
      };
    })
    .filter((row): row is NormalizedKeywordRow => row !== null);
}
