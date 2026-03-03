/**
 * Source keyword CSV normalization.
 *
 * Responsibilities:
 * - Parse `keywords-list.csv` shape used by the career framework.
 * - Split multi-value keyword cells into one row per keyword/module type.
 * - Normalize level labels into canonical level codes and deterministic ordering.
 * - Persist `artifacts/keywords.normalized.csv` used by the scraper runtime.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';
import { FrameworkLevelCode, parseLevelCode } from '../levels/frameworkLevelMapping.js';

export type ModuleType = 'core' | 'ai' | 'softskills';

export interface NormalizedKeywordRow {
  readonly track: string;
  readonly level: string;
  readonly levelCodes: readonly FrameworkLevelCode[];
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

const SOURCE_HEADER_ALIASES: Readonly<Record<string, keyof SourceKeywordCsvRow>> = {
  track: 'Track',
  level: 'Level',
  'core modules': 'Core Modules',
  'ai modules': 'AI Modules',
  softskills: 'Softskills'
};

/**
 * stripBom: internal utility for this module.
 */
function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

/**
 * normalizeHeader: internal utility for this module.
 */
function normalizeHeader(value: string): string {
  const cleaned = stripBom(value).trim();
  const canonical = SOURCE_HEADER_ALIASES[cleaned.toLowerCase()];
  return canonical ?? cleaned;
}

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
      columns: (header: string[]) => header.map((value) => normalizeHeader(value)),
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
    columns: (header: string[]) => header.map((value) => normalizeHeader(value)),
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
 * readRequiredTrack: internal utility for this module.
 */
function readRequiredTrack(row: SourceKeywordCsvRow, rowIndex: number, currentTrack: string): string {
  const trackCandidates = [row.Track]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0);

  if (trackCandidates.length > 0) {
    return trackCandidates[0] ?? currentTrack;
  }

  if (currentTrack.trim().length > 0) {
    return currentTrack;
  }

  const availableKeys = Object.keys(row).sort();
  throw new Error(
    `Missing required track value at source keyword row ${rowIndex + 2}. Available keys: ${availableKeys.join(', ') || '(none)'}`
  );
}

/**
 * readLevelValue: internal utility for this module.
 */
function readLevelValue(row: SourceKeywordCsvRow): string {
  const levelCandidates = [row.Level]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0);
  return levelCandidates[0] ?? '';
}

/**
 * normalizeSourceRows: public helper used by other modules.
 */
export function normalizeSourceRows(rows: readonly SourceKeywordCsvRow[]): readonly NormalizedKeywordRow[] {
  const normalized: Omit<NormalizedKeywordRow, 'levelCodes'>[] = [];
  const seen = new Set<string>();
  const keywordToLevelCodes = new Map<string, FrameworkLevelCode[]>();
  let currentTrack = '';

  for (const [rowIndex, row] of rows.entries()) {
    currentTrack = readRequiredTrack(row, rowIndex, currentTrack);
    const level = readLevelValue(row);
    const parsedLevelCode = parseLevelCode(level);

    for (const moduleConfig of MODULE_FIELDS) {
      const values = splitAndCleanKeywordCell(row[moduleConfig.field]);
      for (const keyword of values) {
        if (parsedLevelCode) {
          const codes = keywordToLevelCodes.get(keyword) ?? [];
          if (!codes.includes(parsedLevelCode)) {
            keywordToLevelCodes.set(keyword, [...codes, parsedLevelCode]);
          }
        }

        const key = `${currentTrack}${level}${moduleConfig.moduleType}${keyword}`;
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

  return normalized
    .map((row): NormalizedKeywordRow => ({
      ...row,
      levelCodes: keywordToLevelCodes.get(row.keyword) ?? []
    }))
    .sort(compareNormalizedRows);
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
    columns: ['track', 'level', 'levelCodes', 'moduleType', 'keyword'],
    cast: {
      object(value) {
        if (Array.isArray(value)) {
          return value.join('|');
        }
        return String(value);
      }
    }
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
