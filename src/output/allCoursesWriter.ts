/**
 * Audit CSV writer for every inspected course candidate.
 *
 * Data-retention behavior:
 * - Appends to an existing audit file across runs (history is preserved).
 * - If an existing file header is incompatible, writes to a `_v2` sibling file to
 *   avoid corrupting prior historical data.
 * - Optional `perRun` dedupe suppresses duplicate `keyword|courseUrl|status` rows
 *   within one execution, but never removes historical rows from previous runs.
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { escapeCsvField } from '../io/incrementalCsvWriter.js';
import { nowIsoUtcMs } from '../utils/date.js';
import { normalizeForMatch } from '../utils/textNormalize.js';

export const ALL_COURSES_HEADERS = [
  'timeAdded',
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
  timeAdded: string;
  keyword: string;
  courseTitle: string;
  courseUrl: string;
  rating: number | '';
  ratingCount: number | '';
  courseInstructionalLevel: string;
  durationMinutes: number | '';
  lastUpdated: string | '';
  status: AllCoursesStatus;
  failureReason: string | '';
}>;

export type AllCoursesAppendInput = Omit<AllCoursesRow, 'timeAdded'>;

export type AllCoursesWriter = {
  readonly outputFilePath: string;
  readonly fileExisted: boolean;
  appendInspectedCourse(row: AllCoursesAppendInput): Promise<boolean>;
  close(): Promise<void>;
};

function getV2Path(originalPath: string): string {
  const ext = path.extname(originalPath);
  const withoutExt = ext ? originalPath.slice(0, -ext.length) : originalPath;
  return `${withoutExt}_v2${ext || '.csv'}`;
}

async function resolveAuditOutputPath(resolvedPath: string): Promise<string> {
  const fileStats = await stat(resolvedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });

  if (fileStats === null || fileStats.size === 0) {
    return resolvedPath;
  }

  const content = await readFile(resolvedPath, 'utf-8');
  const header = content.split(/\r?\n/, 1)[0]?.trimEnd() ?? '';
  const expectedHeader = ALL_COURSES_HEADERS.join(',');

  if (header === expectedHeader) {
    return resolvedPath;
  }

  return getV2Path(resolvedPath);
}

/**
 * Initializes the all-courses audit writer.
 */
export async function initAllCoursesWriter(
  outputFilePath: string,
  options?: { dedupeMode?: AllCoursesDedupeMode }
): Promise<AllCoursesWriter> {
  const requestedPath = path.resolve(outputFilePath);
  const resolvedPath = await resolveAuditOutputPath(requestedPath);
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

  async function appendInspectedCourse(row: AllCoursesAppendInput): Promise<boolean> {
    return queueWrite(async () => {
      if (seenInRun) {
        const dedupeKey = `${normalizeForMatch(row.keyword)}|${row.courseUrl}|${row.status}`;
        if (seenInRun.has(dedupeKey)) {
          return false;
        }
        seenInRun.add(dedupeKey);
      }

      const rowToWrite: AllCoursesRow = {
        timeAdded: nowIsoUtcMs(),
        ...row
      };
      const line = `${ALL_COURSES_HEADERS.map((header) => escapeCsvField(String(rowToWrite[header] ?? ''))).join(',')}\n`;
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
