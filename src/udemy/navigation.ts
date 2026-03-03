/**
 * src/udemy/navigation.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BrowserContext, Page } from 'playwright';
import { Logger } from '../logger.js';
import { throttled } from '../utils/throttle.js';

export type InstructionalLevel = 'all' | 'beginner' | 'intermediate' | 'expert';
export type SortOrder = 'relevance' | 'highest-rated' | 'most-reviewed' | 'newest';
export type DurationBucket = 'extraShort' | 'short' | 'medium' | 'long' | 'extraLong';

export interface SearchFilters {
  readonly minRating?: number;
  readonly kw?: string;
  readonly lang?: string;
  readonly instructionalLevels?: readonly InstructionalLevel[];
  readonly durations?: readonly DurationBucket[];
  readonly sort?: SortOrder;
}

export const UDEMY_ORIGIN = 'https://resillion.udemy.com' as const;
const PARAM_SRC = 'src';
const PARAM_Q = 'q';
const PARAM_RATINGS = 'ratings';
const PARAM_KW = 'kw';
const PARAM_LANG = 'lang';
const PARAM_INSTRUCTIONAL_LEVEL = 'instructional_level';
const PARAM_DURATION = 'duration';
const PARAM_SORT = 'sort';

/**
 * buildSearchUrl: public helper used by other modules.
 */
export function buildSearchUrl(keyword: string, filters: SearchFilters): string {
  const url = new URL('/organization/search/', UDEMY_ORIGIN);
  url.searchParams.set(PARAM_SRC, 'ukw');
  url.searchParams.set(PARAM_Q, keyword);

  if (typeof filters.minRating === 'number' && Number.isFinite(filters.minRating)) {
    const rounded = (Math.round(filters.minRating * 10) / 10).toFixed(1);
    url.searchParams.set(PARAM_RATINGS, rounded);
  }

  if (filters.kw) {
    url.searchParams.set(PARAM_KW, filters.kw);
  }

  if (filters.lang) {
    url.searchParams.set(PARAM_LANG, filters.lang);
  }

  if (filters.instructionalLevels && filters.instructionalLevels.length > 0) {
    for (const level of filters.instructionalLevels) {
      url.searchParams.append(PARAM_INSTRUCTIONAL_LEVEL, level);
    }
  }

  if (filters.durations && filters.durations.length > 0) {
    for (const bucket of filters.durations) {
      url.searchParams.append(PARAM_DURATION, bucket);
    }
  }

  if (filters.sort) {
    url.searchParams.set(PARAM_SORT, filters.sort);
  }

  return url.toString();
}

/**
 * enforceSameTabNavigation: public helper used by other modules.
 */
export function enforceSameTabNavigation(context: BrowserContext, page: Page): void {
  page.on('popup', (popupPage) => {
    void popupPage.close().catch(() => {});
  });

  context.on('page', (newPage) => {
    if (newPage !== page) {
      void newPage.close().catch(() => {});
    }
  });
}

/**
 * gotoWithRetries: public helper used by other modules.
 */
export async function gotoWithRetries(
  page: Page,
  url: string,
  opts: {
    readonly operationName: string;
    readonly throttleMs: number;
    readonly logger: Logger;
  }
): Promise<void> {
  await throttled(
    async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((currentUrl) => currentUrl.host === 'resillion.udemy.com', { timeout: 30000 });
      const currentUrl = page.url().toLowerCase();
      const title = (await page.title().catch(() => '')).toLowerCase();
      if (
        currentUrl.includes('/join/')
        || currentUrl.includes('/login')
        || currentUrl.includes('/sso')
        || title.includes('login')
      ) {
        throw new Error('Not authenticated');
      }
      const response = await page.waitForResponse((response) => response.url() === page.url(), { timeout: 8_000 }).catch(() => null);
      const status = response?.status();
      if (status === 403 || status === 429) {
        const error = new Error(`Navigation blocked with status ${status}`) as Error & { status: number };
        error.status = status;
        throw error;
      }
    },
    {
      operationName: opts.operationName,
      throttleMs: opts.throttleMs,
      logger: opts.logger
    }
  ).catch(async (error) => {
    await writeNavigationFailureArtifacts(page, 'nav_fail', url, error);
    throw error;
  });
}

/**
 * buildPaginatedUrl: public helper used by other modules.
 */
export function buildPaginatedUrl(baseUrl: string, pageIndex: number, variant: 'p' | 'page' | 'pageNumber' | 'start', pageSize: number): string {
  const url = new URL(baseUrl);
  if (variant === 'start') {
    url.searchParams.set('start', String((pageIndex - 1) * pageSize));
  } else {
    url.searchParams.set(variant, String(pageIndex));
  }
  return url.toString();
}

/**
 * sanitizeToken: internal utility for this module.
 */
function sanitizeToken(input: string): string {
  return input.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80) || 'unknown';
}

/**
 * writeNavigationFailureArtifacts: public helper used by other modules.
 */
export async function writeNavigationFailureArtifacts(page: Page, prefix: string, targetUrl: string, error: unknown, keyword?: string): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = sanitizeToken(`${prefix}_${keyword ?? 'na'}_${ts}`);
  const dir = path.join('artifacts', 'nav_failures');
  await fs.mkdir(dir, { recursive: true });
  const pngPath = path.join(dir, `${slug}.png`);
  const htmlPath = path.join(dir, `${slug}.html`);
  const txtPath = path.join(dir, `${slug}.txt`);

  if (!page.isClosed()) {
    await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    await fs.writeFile(htmlPath, html, 'utf-8').catch(() => {});
  }

  const context = `url=${targetUrl}\nkeyword=${keyword ?? ''}\nerror=${String(error)}\n`;
  await fs.writeFile(txtPath, context, 'utf-8').catch(() => {});
}
