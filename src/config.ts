/**
 * CLI/runtime configuration parser and default application settings.
 *
 * Responsibilities:
 * - Parse supported CLI flags used by `src/cli.ts`.
 * - Validate constrained enums (browser channel, duration buckets, dedupe mode).
 * - Provide hardcoded app defaults for tenant URL, filter thresholds, and paths.
 *
 * Notable behavior:
 * - `--concurrency` is accepted but intentionally pinned to sequential mode (`1`).
 * - Empty `--durations` means "use config defaults" rather than "disable duration filtering".
 */

import * as path from 'node:path';
import { BrowserChannel, CliOptions, AppConfig } from './types.js';
import { DurationBucket } from './udemy/navigation.js';

const DEFAULT_ENGLISH_LOCALES = ['en', 'en_US', 'en_GB'];
const ALLOWED_BROWSER_CHANNELS: readonly BrowserChannel[] = ['chrome', 'msedge', 'chromium'];
const ALLOWED_DURATION_BUCKETS = ['extraShort', 'short', 'medium', 'long', 'extraLong'] as const;
const DEFAULT_DURATION_BUCKETS = ['extraShort', 'short', 'medium', 'long'] as const;
const ALLOWED_ALL_COURSES_DEDUPE = ['none', 'perRun'] as const;

/**
 * parseBoolean: internal utility for this module.
 */
function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return true;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

/**
 * parseBrowserChannel: internal utility for this module.
 */
function parseBrowserChannel(value: string | undefined): BrowserChannel {
  if (!value) {
    return 'chrome';
  }
  if (ALLOWED_BROWSER_CHANNELS.includes(value as BrowserChannel)) {
    return value as BrowserChannel;
  }
  throw new Error(`Invalid --browserChannel value: ${value}. Allowed values: ${ALLOWED_BROWSER_CHANNELS.join(', ')}`);
}

/**
 * parseDurations: internal utility for this module.
 */
function parseDurations(value: string | undefined): DurationBucket[] {
  if (!value) {
    return [];
  }

  const parsed = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const invalid = parsed.filter((entry) => !ALLOWED_DURATION_BUCKETS.includes(entry as typeof ALLOWED_DURATION_BUCKETS[number]));

  if (invalid.length > 0) {
    throw new Error(`Invalid --durations value(s): ${invalid.join(', ')}. Allowed values: ${ALLOWED_DURATION_BUCKETS.join(', ')}`);
  }

  return parsed as DurationBucket[];
}

/**
 * parseAllCoursesDedupe: internal utility for this module.
 */
function parseAllCoursesDedupe(value: string | undefined): 'none' | 'perRun' {
  if (!value) {
    return 'none';
  }

  if (ALLOWED_ALL_COURSES_DEDUPE.includes(value as typeof ALLOWED_ALL_COURSES_DEDUPE[number])) {
    return value as 'none' | 'perRun';
  }

  throw new Error(`Invalid --allCoursesDedupe value: ${value}. Allowed values: ${ALLOWED_ALL_COURSES_DEDUPE.join(', ')}`);
}

/**
 * getCliOptions: public helper used by other modules.
 */
export function getCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    headless: false,
    debug: false,
    browserChannel: 'chrome',
    maxCoursesPerKeyword: 200,
    maxPages: 15,
    throttleMs: 275,
    concurrency: 1,
    profileDir: './artifacts/profile',
    allCoursesDedupe: 'none'
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith('--')) {
      continue;
    }

    const hasInlineValue = arg.includes('=');
    const [flag, inlineValue] = hasInlineValue ? arg.split('=', 2) : [arg, undefined];
    const candidate = argv[i + 1];
    const nextValue = !hasInlineValue && candidate !== undefined && !candidate.startsWith('--') ? candidate : undefined;
    const value = inlineValue ?? nextValue;

    switch (flag) {
      case '--headless':
        options.headless = parseBoolean(value, options.headless);
        break;
      case '--debug':
        options.debug = parseBoolean(value, options.debug);
        break;
      case '--browserChannel':
        options.browserChannel = parseBrowserChannel(value);
        break;
      case '--maxCoursesPerKeyword':
        if (value !== undefined) {
          options.maxCoursesPerKeyword = Number(value);
        }
        break;
      case '--maxPages':
        if (value !== undefined) {
          options.maxPages = Number(value);
        }
        break;
      case '--throttleMs':
        if (value !== undefined) {
          options.throttleMs = Number(value);
        }
        break;
      case '--concurrency':
        if (value !== undefined) {
          options.concurrency = 1;
        }
        break;
      case '--profileDir':
        if (value !== undefined) {
          options.profileDir = value;
        }
        break;
      case '--keywordsFile':
        if (value !== undefined) {
          options.keywordsFile = value;
        }
        break;
      case '--normalizedKeywordsFile':
        if (value !== undefined) {
          options.normalizedKeywordsFile = value;
        }
        break;
      case '--durations':
        options.durations = parseDurations(value);
        break;
      case '--allCoursesDedupe':
        options.allCoursesDedupe = parseAllCoursesDedupe(value);
        break;
      default:
        break;
    }

    if (!hasInlineValue && nextValue !== undefined) {
      i += 1;
    }
  }

  return options;
}

/**
 * getAppConfig: public helper used by other modules.
 */
export function getAppConfig(): AppConfig {
  return {
    baseUrl: 'https://resillion.udemy.com',
    orgHomePath: '/organization/home/',
    inputCsvPath: './keywords-list.csv',
    normalizedKeywordsCsvPath: './artifacts/keywords.normalized.csv',
    outputCsvPath: './artifacts/udemy/top_courses.csv',
    englishLocales: new Set(DEFAULT_ENGLISH_LOCALES),
    minRating: 4.6,
    minRatingCount: 5000,
    filters: {
      durations: DEFAULT_DURATION_BUCKETS
    }
  };
}

/**
 * resolvePath: public helper used by other modules.
 */
export function resolvePath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
