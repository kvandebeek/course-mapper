import { appendFile, mkdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { escapeCsvField } from '../io/incrementalCsvWriter.js';

export const ALL_COURSES_HEADERS = [
  'runId',
  'keyword',
  'courseTitle',
  'courseUrl',
  'rating',
  'ratingCount',
  'courseInstructionalLevel',
  'durationMinutes',
  'lastUpdated',
  'status',
  'failureReason'
] as const;

export type AllCoursesStatus = 'inspected' | 'accepted' | 'rejected';
export type AllCoursesDedupeMode = 'none' | 'perRun';

export type AllCoursesRow = Readonly<{
  runId: string;
  keyword: string;
  courseTitle: string;
  courseUrl: string;
  rating: number | '';
  ratingCount: number | '';
  courseInstructionalLevel: string;
  durationMinutes: number | '';
  lastUpdated: string;
  status: AllCoursesStatus;
  failureReason: string;
}>;

export type AllCoursesWriter = {
  readonly outputFilePath: string;
  readonly fileExisted: boolean;
  appendInspectedCourse(row: AllCoursesRow): Promise<boolean>;
  close(): Promise<void>;
};

export async function initAllCoursesWriter(
  outputFilePath: string,
  options?: { dedupeMode?: AllCoursesDedupeMode }
): Promise<AllCoursesWriter> {
  const resolvedPath = path.resolve(outputFilePath);
  const dedupeMode = options?.dedupeMode ?? 'none';
  const seenInRun = dedupeMode === 'perRun' ? new Set<string>() : null;

  await mkdir(path.dirname(resolvedPath), { recursive: true });

  const fileStats = await stat(resolvedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  const fileExisted = fileStats !== null;
  if (fileStats === null || fileStats.size === 0) {
    await appendFile(resolvedPath, `${ALL_COURSES_HEADERS.map(escapeCsvField).join(',')}\n`, 'utf-8');
  }

  let pendingWrite = Promise.resolve();

  function queueWrite(task: () => Promise<boolean>): Promise<boolean> {
    const next = pendingWrite.then(task);
    pendingWrite = next.then(() => undefined, () => undefined);
    return next;
  }

  async function appendInspectedCourse(row: AllCoursesRow): Promise<boolean> {
    return queueWrite(async () => {
      if (seenInRun) {
        const dedupeKey = `${row.keyword}|${row.courseUrl}|${row.status}`;
        if (seenInRun.has(dedupeKey)) {
          return false;
        }
        seenInRun.add(dedupeKey);
      }

      const line = `${ALL_COURSES_HEADERS.map((header) => escapeCsvField(String(row[header] ?? ''))).join(',')}\n`;
      await appendFile(resolvedPath, line, 'utf-8');
      return true;
    });
  }

  async function close(): Promise<void> {
    await pendingWrite;
  }

  return {
    outputFilePath: resolvedPath,
    fileExisted,
    appendInspectedCourse,
    close
  };
}
