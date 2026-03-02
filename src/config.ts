import * as path from 'node:path';
import { BrowserChannel, CliOptions, AppConfig } from './types.js';

const DEFAULT_ENGLISH_LOCALES = ['en', 'en_US', 'en_GB'];
const ALLOWED_BROWSER_CHANNELS: readonly BrowserChannel[] = ['chrome', 'msedge', 'chromium'];

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

function parseBrowserChannel(value: string | undefined): BrowserChannel {
  if (!value) {
    return 'chrome';
  }
  if (ALLOWED_BROWSER_CHANNELS.includes(value as BrowserChannel)) {
    return value as BrowserChannel;
  }
  throw new Error(`Invalid --browserChannel value: ${value}. Allowed values: ${ALLOWED_BROWSER_CHANNELS.join(', ')}`);
}

export function getCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    headless: false,
    debug: false,
    browserChannel: 'chrome',
    maxCoursesPerKeyword: 200,
    maxPages: 15,
    throttleMs: 300,
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
          options.concurrency = Math.max(1, Number(value));
        }
        break;
      case '--profileDir':
        if (value !== undefined) {
          options.profileDir = value;
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

export function getAppConfig(): AppConfig {
  return {
    baseUrl: 'https://resillion.udemy.com',
    orgHomePath: '/organization/home/',
    inputCsvPath: './input/keywords.csv',
    outputCsvPath: './artifacts/udemy/top_courses.csv',
    englishLocales: new Set(DEFAULT_ENGLISH_LOCALES),
    minRating: 4.4,
    minRatingCount: 1500,
    recencyMonths: 36
  };
}

export function resolvePath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}
