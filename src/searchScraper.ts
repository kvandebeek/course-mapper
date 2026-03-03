/**
 * src/searchScraper.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Page, Response } from 'playwright';
import { Logger } from './logger.js';
import { RuntimeSession } from './runtime/session.js';
import { SearchResultPayload } from './types.js';
import {
  buildResponsePredicate,
  safeJson,
  sniffSearchResultsEndpoint,
  summarizeCandidates,
  waitForResponseOrClose
} from './udemy/searchTransport.js';
import { UnknownRecord, isRecord, tryExtractHits } from './udemy/types.js';
import { isBlockedByKeyword } from './udemy/blockedKeywords.js';

interface SearchParams {
  readonly maxCoursesPerKeyword: number;
  readonly maxPages: number;
  readonly throttleMs: number;
}

interface KeywordFailure {
  readonly reason: string;
}

export interface ScrapeKeywordResult {
  readonly courses: readonly SearchResultPayload[];
  readonly failureReason?: string;
}

/**
 * shouldStopPagination: public helper used by other modules.
 */
export function shouldStopPagination(previousUniqueTotal: number, newUniqueTotal: number): boolean {
  return newUniqueTotal - previousUniqueTotal <= 0;
}

/**
 * sleepWithJitter: public helper used by other modules.
 */
export async function sleepWithJitter(baseMs: number, jitterMinMs: number, jitterMaxMs: number): Promise<void> {
  const boundedJitterMin = Math.max(0, jitterMinMs);
  const boundedJitterMax = Math.max(boundedJitterMin, jitterMaxMs);
  const deterministicJitter = Math.floor((boundedJitterMin + boundedJitterMax) / 2);
  const delayMs = Math.max(0, baseMs + deterministicJitter);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * isSearchUnavailable: public helper used by other modules.
 */
export async function isSearchUnavailable(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  return bodyText.toLowerCase().includes('search is currently unavailable');
}

/**
 * extractCoursesFromDom: public helper used by other modules.
 */
export async function extractCoursesFromDom(page: Page, logger?: Logger): Promise<readonly SearchResultPayload[]> {
  const cards = page.locator('[data-testid="course-card-title"], [data-purpose="search-course-card-title"]');
  const count = await cards.count();
  const found: SearchResultPayload[] = [];

  for (let index = 0; index < count; index += 1) {
    const titleNode = cards.nth(index);
    const title = (await titleNode.innerText().catch(() => '')).trim();
    const href = await titleNode.getAttribute('href').catch(() => null);
    const card = titleNode.locator('xpath=ancestor::a[1]');
    const absoluteHref = href ?? (await card.getAttribute('href').catch(() => null));
    if (!title || !absoluteHref) {
      continue;
    }

    const normalizedUrl = normalizeUrl(absoluteHref);
    const blockedByKeyword = isBlockedByKeyword(title);
    if (blockedByKeyword.blocked) {
      logger?.info('Course rejected', {
        courseUrl: normalizedUrl,
        reason: 'blocked_keyword',
        matchedKeyword: blockedByKeyword.matched
      });
      continue;
    }

    const id = normalizedUrl.split('/course/')[1]?.split('/')[0] ?? normalizedUrl;
    found.push({
      id,
      title,
      url: normalizedUrl,
      locale: '',
      rating: null,
      ratingCount: null
    });
  }

  return found;
}

/**
 * scrapeKeywordCourses: public helper used by other modules.
 */
export async function scrapeKeywordCourses(
  session: RuntimeSession,
  baseUrl: string,
  keyword: string,
  params: SearchParams,
  logger: Logger
): Promise<ScrapeKeywordResult> {
  const courseMap = new Map<string, SearchResultPayload>();
  let previousUniqueTotal = 0;
  let sniffedCandidates: readonly string[] = [];
  let failure: KeywordFailure | undefined;

  for (let pageNum = 1; pageNum <= params.maxPages; pageNum += 1) {
    if (courseMap.size >= params.maxCoursesPerKeyword) {
      break;
    }

    const searchUrl = buildSearchUrl(baseUrl, keyword, pageNum);
    let pageSucceeded = false;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptStart = Date.now();
      const traceFile = path.join('artifacts', 'debug', sanitizeKeyword(keyword), `page-${pageNum}-attempt-${attempt}.zip`);

      try {
        const page = await session.ensurePage();
        attachPageObservers(page, keyword, pageNum, logger);

        await session.context.tracing.start({ screenshots: true, snapshots: true });
        logger.info('Navigating keyword search page', { keyword, pageNum, attempt, url: searchUrl });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const recovered = await recoverUnavailableSearch(page, keyword, pageNum, logger);
        if (!recovered) {
          failure = { reason: 'search_unavailable' };
          await session.context.tracing.stop();
          pageSucceeded = false;
          break;
        }

        if (pageNum === 1 && sniffedCandidates.length === 0) {
          sniffedCandidates = await sniffSearchResultsEndpoint(page, 1500);
          logger.info('Search endpoint candidates sniffed', {
            keyword,
            pageNum,
            candidates: summarizeCandidates(sniffedCandidates)
          });
        }

        const apiEntries = await extractViaApiOrDom(page, pageNum, sniffedCandidates, logger, keyword);
        for (const entry of apiEntries) {
          if (!courseMap.has(entry.id)) {
            courseMap.set(entry.id, entry);
          }
        }

        const newUniqueTotal = courseMap.size;
        await session.context.tracing.stop();

        logger.info('Search page extracted', {
          keyword,
          pageNum,
          attempt,
          extracted: apiEntries.length,
          totalUnique: newUniqueTotal
        });

        if (shouldStopPagination(previousUniqueTotal, newUniqueTotal) && pageNum > 1) {
          logger.info('No new unique results; stopping pagination', { keyword, pageNum, uniqueTotal: newUniqueTotal });
          const courses = [...courseMap.values()].slice(0, params.maxCoursesPerKeyword);
          return failure ? { courses, failureReason: failure.reason } : { courses };
        }

        previousUniqueTotal = newUniqueTotal;
        pageSucceeded = true;
        break;
      } catch (error) {
        const durationMs = Date.now() - attemptStart;
        const message = String(error);
        logger.warn('Keyword page attempt failed', { keyword, pageNum, attempt, durationMs, error: message });
        await captureDiagnostics(session.page, keyword, pageNum, attempt, traceFile, logger);
        await recoverFromPageOrContextClosure(session.page, message, logger);

        if (attempt === 3) {
          failure = { reason: 'page_attempt_failed' };
          logger.error('Keyword page failed after retries', { keyword, pageNum, durationMs, error: message });
        }
      }
    }

    if (!pageSucceeded) {
      break;
    }

    await sleepWithJitter(params.throttleMs, 400, 1200);
  }

  const courses = [...courseMap.values()].slice(0, params.maxCoursesPerKeyword);
  return failure ? { courses, failureReason: failure.reason } : { courses };
}

/**
 * extractViaApiOrDom: internal utility for this module.
 */
async function extractViaApiOrDom(
  page: Page,
  pageNum: number,
  sniffedCandidates: readonly string[],
  logger: Logger,
  keyword: string
): Promise<readonly SearchResultPayload[]> {
  if (sniffedCandidates.length > 0) {
    const response = await waitForResponseOrClose(page, buildResponsePredicate(sniffedCandidates, pageNum), 15000);
    if (response) {
      logBadStatus(response, logger, keyword, pageNum);
      const payload = await safeJson(response);
      const hits = payload ? tryExtractHits(payload) : undefined;
      if (hits && hits.length > 0) {
        return hits
          .map(mapHitToSearchPayload)
          .filter((item): item is SearchResultPayload => item !== null)
          .filter((item) => {
            const blockedByKeyword = isBlockedByKeyword(item.title);
            if (!blockedByKeyword.blocked) {
              return true;
            }

            logger.info('Course rejected', {
              courseUrl: item.url,
              reason: 'blocked_keyword',
              matchedKeyword: blockedByKeyword.matched
            });
            return false;
          });
      }
    }
  }

  logger.warn('API response capture failed; using DOM fallback', { keyword, pageNum });
  return extractCoursesFromDom(page, logger);
}

/**
 * logBadStatus: internal utility for this module.
 */
function logBadStatus(response: Response, logger: Logger, keyword: string, pageNum: number): void {
  const status = response.status();
  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    const hint = status === 429 ? 'rate limited' : status === 403 ? 'forbidden' : status === 401 ? 'unauthorized' : 'server failure';
    logger.warn('Candidate API returned warning status', { keyword, pageNum, url: response.url(), status, hint });
  }
}

/**
 * attachPageObservers: internal utility for this module.
 */
function attachPageObservers(page: Page, keyword: string, pageNum: number, logger: Logger): void {
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');

  page.on('console', (message) => {
    const location = message.location().url;
    if (message.type() === 'error') {
      logger.debug('Page console error', { keyword, pageNum, location, text: message.text() });
    }
  });

  page.on('pageerror', (error) => {
    logger.warn('Page runtime error', { keyword, pageNum, error: String(error) });
  });
}

/**
 * recoverUnavailableSearch: internal utility for this module.
 */
async function recoverUnavailableSearch(page: Page, keyword: string, pageNum: number, logger: Logger): Promise<boolean> {
  const unavailable = await isSearchUnavailable(page);
  if (!unavailable) {
    return true;
  }

  for (let retry = 1; retry <= 3; retry += 1) {
    const backoffBase = 1500 * 2 ** (retry - 1);
    logger.warn('Search is currently unavailable; retrying page', { keyword, pageNum, retry, backoffBaseMs: backoffBase });
    await sleepWithJitter(backoffBase, 400, 1200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await isSearchUnavailable(page))) {
      return true;
    }
  }

  logger.warn('Search unavailable persisted; skipping keyword pagination', { keyword, pageNum });
  return false;
}

/**
 * recoverFromPageOrContextClosure: internal utility for this module.
 */
async function recoverFromPageOrContextClosure(page: Page, errorMessage: string, logger: Logger): Promise<void> {
  const closedPage = page.isClosed();
  const closureError = errorMessage.toLowerCase().includes('context or browser has been closed');

  if (closedPage || closureError) {
    logger.warn('Page closed or invalidated; session will ensure page on next attempt');
  }
}

/**
 * captureDiagnostics: internal utility for this module.
 */
async function captureDiagnostics(
  page: Page,
  keyword: string,
  pageNum: number,
  attempt: number,
  traceFile: string,
  logger: Logger
): Promise<void> {
  const debugDir = path.join('artifacts', 'debug', sanitizeKeyword(keyword));
  await fs.mkdir(debugDir, { recursive: true });

  try {
    if (!page.isClosed()) {
      const screenshotPath = path.join(debugDir, `page-${pageNum}-attempt-${attempt}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  } catch (error) {
    logger.warn('Unable to capture screenshot', { keyword, pageNum, attempt, error: String(error) });
  }

  try {
    await page.context().tracing.stop({ path: traceFile });
  } catch (error) {
    logger.warn('Unable to write trace', { keyword, pageNum, attempt, error: String(error) });
  }
}

/**
 * buildSearchUrl: internal utility for this module.
 */
function buildSearchUrl(baseUrl: string, keyword: string, pageNum: number): string {
  const query = new URL('/organization/search/', baseUrl);
  query.searchParams.set('q', keyword);
  query.searchParams.set('p', String(pageNum));
  query.searchParams.set('src', 'ukw');
  return query.toString();
}

/**
 * mapHitToSearchPayload: internal utility for this module.
 */
function mapHitToSearchPayload(course: UnknownRecord): SearchResultPayload | null {
  const idValue = course.id;
  const title = toString(course.title);
  const url = normalizeUrl(toString(course.url));

  if ((typeof idValue !== 'string' && typeof idValue !== 'number') || !title || !url) {
    return null;
  }

  const locale = isRecord(course.locale) ? toString(course.locale.locale) : '';

  return {
    id: String(idValue),
    url,
    title,
    locale: locale || toString(course.locale_simple),
    rating: toNumber(course.rating),
    ratingCount: toNumber(course.num_reviews),
  };
}

/**
 * sanitizeKeyword: internal utility for this module.
 */
function sanitizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'keyword';
}

/**
 * toString: internal utility for this module.
 */
function toString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * toNumber: internal utility for this module.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * normalizeUrl: internal utility for this module.
 */
function normalizeUrl(url: string): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('http')) {
    return url;
  }
  return `https://resillion.udemy.com${url.startsWith('/') ? '' : '/'}${url}`;
}
