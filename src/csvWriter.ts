import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { CourseScored } from './types.js';

export async function writeOutputCsv(outputPath: string, rows: CourseScored[]): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const payload = rows.map((row) => ({
    track: row.track,
    level: row.level,
    moduleType: row.moduleType,
    keyword: row.keyword,
    courseId: row.courseId,
    url: row.url,
    title: row.title,
    instructors: row.instructors,
    language: row.language,
    durationMinutes: row.durationMinutes ?? '',
    udemyLevel: row.udemyLevel ?? '',
    category: row.category ?? '',
    rating: row.rating ?? '',
    ratingCount: row.ratingCount ?? '',
    lastUpdated: row.lastUpdated ?? '',
    score: row.score
  }));

  const csv = stringify(payload, {
    header: true,
    columns: [
      'track',
      'level',
      'moduleType',
      'keyword',
      'courseId',
      'url',
      'title',
      'instructors',
      'language',
      'durationMinutes',
      'udemyLevel',
      'category',
      'rating',
      'ratingCount',
      'lastUpdated',
      'score'
    ]
  });

  await writeFile(outputPath, csv, 'utf-8');
}
