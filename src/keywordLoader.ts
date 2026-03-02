import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { KeywordRow } from './types.js';

function toRequiredString(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

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
      moduleType: toRequiredString(row.moduleType),
      keyword: toRequiredString(row.keyword)
    }))
    .filter((row) => row.keyword.length > 0);
}
