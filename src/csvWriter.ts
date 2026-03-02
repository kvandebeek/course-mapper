import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { CourseCsvRow } from './types.js';

export async function writeOutputCsv(outputPath: string, rows: readonly CourseCsvRow[]): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const payload = rows.map((row) => ({
    keyword: row.keyword,
    courseTitle: row.courseTitle,
    courseUrl: row.courseUrl,
    rating: row.rating ?? '',
    ratingCount: row.ratingCount ?? '',
    lastUpdateDate: row.lastUpdateDate ?? '',
    publishedDate: row.publishedDate ?? '',
    instructors: row.instructors,
    courseId: row.courseId ?? ''
  }));

  const csv = stringify(payload, {
    header: true,
    columns: [
      'keyword',
      'courseTitle',
      'courseUrl',
      'rating',
      'ratingCount',
      'lastUpdateDate',
      'publishedDate',
      'instructors',
      'courseId'
    ]
  });

  await writeFile(outputPath, csv, 'utf-8');
}
