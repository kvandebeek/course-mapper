import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { ExportRow } from './types.js';

const CSV_HEADERS: readonly string[] = [
  'keyword',
  'courseTitle',
  'courseUrl',
  'rating',
  'ratingCount'
];

export async function writeOutputCsv(outputPath: string, rows: readonly ExportRow[]): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const data = rows.map((row) => [
    row.keyword,
    row.courseTitle,
    row.courseUrl,
    row.rating,
    row.ratingCount
  ]);

  const csv = stringify([CSV_HEADERS, ...data]);
  await writeFile(outputPath, csv, 'utf-8');
}
