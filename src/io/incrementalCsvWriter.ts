/**
 * Incremental CSV append writer.
 *
 * Responsibilities:
 * - Ensure parent directory and header line exist.
 * - Serialize rows in configured column order.
 * - Queue writes per output file path to keep append order deterministic and
 *   prevent line interleaving under async call patterns.
 */
import { appendFile, mkdir, stat } from 'node:fs/promises';
import * as path from 'node:path';

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Readonly<Record<string, CsvValue>>;

export type IncrementalCsvWriterOptions = Readonly<{
  outputFilePath: string;
  headers: readonly string[];
  alwaysWriteHeader?: boolean;
}>;

type QueueState = {
  tail: Promise<void>;
};

const fileQueues = new Map<string, QueueState>();

/**
 * escapeCsvField: public helper used by other modules.
 */
export function escapeCsvField(value: string): string {
  const needsQuoting = value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r');
  const escaped = value.replaceAll('"', '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * Creates a row-appending CSV writer that is safe to call repeatedly throughout
 * a run (including inside per-keyword loops).
 */
export function createIncrementalCsvWriter(options: IncrementalCsvWriterOptions): {
  appendRow(row: CsvRow): Promise<void>;
} {
  const outputFilePath = path.resolve(options.outputFilePath);
  const headers = [...options.headers];
  const alwaysWriteHeader = options.alwaysWriteHeader ?? false;

  const queue = fileQueues.get(outputFilePath) ?? { tail: Promise.resolve() };
  fileQueues.set(outputFilePath, queue);

  let headerChecked = false;

  async function ensureHeader(): Promise<void> {
    if (headerChecked) {
      return;
    }

    await mkdir(path.dirname(outputFilePath), { recursive: true });

    if (alwaysWriteHeader) {
      const headerLine = `${headers.map(escapeCsvField).join(',')}\n`;
      await appendFile(outputFilePath, headerLine, 'utf-8');
      headerChecked = true;
      return;
    }

    const fileStats = await stat(outputFilePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });

    if (fileStats === null || fileStats.size === 0) {
      const headerLine = `${headers.map(escapeCsvField).join(',')}\n`;
      await appendFile(outputFilePath, headerLine, 'utf-8');
    }

    headerChecked = true;
  }

  function queueAppend(task: () => Promise<void>): Promise<void> {
    const next = queue.tail.then(task);
    queue.tail = next.catch(() => undefined);
    return next;
  }

  async function appendRow(row: CsvRow): Promise<void> {
    return queueAppend(async () => {
      await ensureHeader();
      const line = `${headers.map((header) => escapeCsvField(String(row[header] ?? ''))).join(',')}\n`;
      await appendFile(outputFilePath, line, 'utf-8');
    });
  }

  return { appendRow };
}
