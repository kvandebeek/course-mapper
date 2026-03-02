/**
 * src/config.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import * as path from 'node:path';
import { BrowserChannel, CliOptions, AppConfig } from './types.js';

const DEFAULT_ENGLISH_LOCALES = ['en', 'en_US', 'en_GB'];
const ALLOWED_BROWSER_CHANNELS: readonly BrowserChannel[] = ['chrome', 'msedge', 'chromium'];

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
 * getCliOptions: public helper used by other modules.
 */
export function getCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    headless: false,
    debug: false,
    browserChannel: 'chrome',
    maxCoursesPerKeyword: 200,
    maxPages: 15,
    throttleMs: 3200,
    concurrency: 1,
    profileDir: './artifacts/profile'
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
    minRating: 4.5,
    minRatingCount: 1500,
  };
}

/**
 * resolvePath: public helper used by other modules.
 */
export function resolvePath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
