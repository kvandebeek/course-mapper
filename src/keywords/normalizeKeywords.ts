/**
 * src/keywords/normalizeKeywords.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

export type ModuleType = 'core' | 'ai' | 'softskills';

export interface NormalizedKeywordRow {
  readonly track: string;
  readonly level: string;
  readonly moduleType: ModuleType;
  readonly keyword: string;
}

interface SourceKeywordCsvRow {
  readonly Track?: string;
  readonly Level?: string;
  readonly 'Core Modules'?: string;
  readonly 'AI Modules'?: string;
  readonly Softskills?: string;
}

interface NormalizeKeywordsFileParams {
  readonly sourceFile: string;
  readonly outputFile: string;
}

const MODULE_FIELDS: readonly { readonly field: keyof SourceKeywordCsvRow; readonly moduleType: ModuleType }[] = [
  { field: 'Core Modules', moduleType: 'core' },
  { field: 'AI Modules', moduleType: 'ai' },
  { field: 'Softskills', moduleType: 'softskills' }
];

/**
 * hasExpectedHeaders: internal utility for this module.
 */
function hasExpectedHeaders(rows: readonly SourceKeywordCsvRow[]): boolean {
  if (rows.length === 0) {
    return false;
  }
  const sample = rows[0];
  if (sample === undefined) {
    return false;
  }
  return Object.hasOwn(sample, 'Track') && Object.hasOwn(sample, 'Level');
}

/**
 * parseSourceRows: internal utility for this module.
 */
function parseSourceRows(content: string): readonly SourceKeywordCsvRow[] {
  let semicolonRows: readonly SourceKeywordCsvRow[] = [];

  try {
    semicolonRows = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: ';'
    }) as SourceKeywordCsvRow[];
  } catch {
    semicolonRows = [];
  }

  if (hasExpectedHeaders(semicolonRows)) {
    return semicolonRows;
  }

  return parseCsv(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ','
  }) as SourceKeywordCsvRow[];
}

/**
 * Example: "Introduction to Testing, Test Case Design" becomes
 * ["Introduction to Testing", "Test Case Design"] so each keyword is processed independently.
 */
/**
 * splitAndCleanKeywordCell: public helper used by other modules.
 */
export function splitAndCleanKeywordCell(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((entry) => entry.length > 0);
}

/**
 * compareNormalizedRows: internal utility for this module.
 */
function compareNormalizedRows(a: NormalizedKeywordRow, b: NormalizedKeywordRow): number {
  if (a.track !== b.track) {
    return a.track.localeCompare(b.track);
  }
  if (a.level !== b.level) {
    return a.level.localeCompare(b.level);
  }
  if (a.moduleType !== b.moduleType) {
    return a.moduleType.localeCompare(b.moduleType);
  }
  return a.keyword.localeCompare(b.keyword);
}

/**
 * normalizeSourceRows: public helper used by other modules.
 */
export function normalizeSourceRows(rows: readonly SourceKeywordCsvRow[]): readonly NormalizedKeywordRow[] {
  const normalized: NormalizedKeywordRow[] = [];
  const seen = new Set<string>();
  let currentTrack = '';

  for (const row of rows) {
    const track = (row.Track ?? '').trim();
    if (track.length > 0) {
      currentTrack = track;
    }

    const level = (row.Level ?? '').trim();

    for (const moduleConfig of MODULE_FIELDS) {
      const values = splitAndCleanKeywordCell(row[moduleConfig.field]);
      for (const keyword of values) {
        const key = `${currentTrack}\u001f${level}\u001f${moduleConfig.moduleType}\u001f${keyword}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        normalized.push({
          track: currentTrack,
          level,
          moduleType: moduleConfig.moduleType,
          keyword
        });
      }
    }
  }

  return normalized.sort(compareNormalizedRows);
}

/**
 * normalizeKeywordsFromString: public helper used by other modules.
 */
export function normalizeKeywordsFromString(content: string): readonly NormalizedKeywordRow[] {
  const parsedRows = parseSourceRows(content);
  return normalizeSourceRows(parsedRows);
}

/**
 * normalizeKeywordsFile: public helper used by other modules.
 */
export async function normalizeKeywordsFile(
  params: NormalizeKeywordsFileParams
): Promise<{ readonly rows: readonly NormalizedKeywordRow[]; readonly writtenTo: string }> {
  const sourcePath = path.resolve(params.sourceFile);
  const outputPath = path.resolve(params.outputFile);

  let sourceContent = '';
  try {
    sourceContent = await readFile(sourcePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read keywords file at ${sourcePath}: ${String(error)}`);
  }

  const rows = normalizeKeywordsFromString(sourceContent);
  const csv = stringifyCsv([...rows], {
    header: true,
    columns: ['track', 'level', 'moduleType', 'keyword']
  });

  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, csv, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write normalized keywords file at ${outputPath}: ${String(error)}`);
  }

  return {
    rows,
    writtenTo: outputPath
  };
}
