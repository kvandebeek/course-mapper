import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Page } from 'playwright';
import { Logger } from '../logger.js';
import { extractCourseDetail, CourseDetail } from './extractCourseDetail.js';
import {
  SearchFilters,
  buildSearchUrl,
  gotoWithRetries,
  writeNavigationFailureArtifacts
} from './navigation.js';
import { sleepMs, throttled } from '../utils/throttle.js';

const RESULT_WAIT_TIMEOUT_MS = 20_000;
const LOAD_MORE_WAIT_TIMEOUT_MS = 8_000;
const DEBUG_HREF_LIMIT = 30;

export type CourseUrl = string;

export const DEFAULT_FILTERS: SearchFilters = {
  minRating: 4.5,
  lang: 'en',
  sort: 'most-reviewed'
};

export async function collectCourseUrlsForKeyword(
  page: Page,
  keyword: string,
  opts: {
    readonly filters: SearchFilters;
    readonly maxCourses: number;
    readonly maxPages: number;
    readonly throttleMs: number;
  },
  logger: Logger
): Promise<readonly string[]> {
  const baseSearchUrl = buildSearchUrl(keyword, opts.filters);
  logger.info('Keyword URL collection started', { keyword, baseSearchUrl });

  const unique = new Set<CourseUrl>();

  try {
    await gotoWithRetries(page, baseSearchUrl, { operationName: 'openSearchPage', throttleMs: opts.throttleMs, logger });
    await sleepMs(1200);
    await waitForSearchResultsUi(page, opts.throttleMs, logger);
  } catch (error) {
    await writeNavigationFailureArtifacts(page, 'search_nav_fail', baseSearchUrl, error, keyword);
    logger.warn('Search navigation failed', { keyword, url: baseSearchUrl, error: String(error) });
    return [];
  }

  for (let pageIndex = 1; pageIndex <= opts.maxPages; pageIndex += 1) {
    const iteration = await collectSearchIteration(page, keyword, unique, opts.maxCourses, logger, pageIndex);
    if (iteration.extractedCount === 0) {
      await dumpEmptySearchHtml(keyword, page, await page.content(), logger, iteration.debug);
    }

    if (unique.size >= opts.maxCourses) {
      logger.info('Reached max course URL cap', { keyword, maxCourses: opts.maxCourses });
      break;
    }

    if (iteration.addedCount === 0) {
      logger.info('Pagination ended early due to no new urls', { keyword, pageIndex, totalUnique: unique.size });
      break;
    }

    const loadedMore = await tryLoadMoreResults(page, keyword, pageIndex, logger, opts.throttleMs);
    if (!loadedMore) {
      logger.info('Pagination ended: no load-more action available', { keyword, pageIndex, totalUnique: unique.size });
      break;
    }

    const grew = await waitForCourseAnchorGrowth(page, iteration.courseLikeAnchorCount, opts.throttleMs, logger);
    if (!grew) {
      logger.info('Pagination ended: no additional course anchors found after load more', {
        keyword,
        pageIndex,
        totalUnique: unique.size
      });
      break;
    }
  }

  return [...unique].slice(0, opts.maxCourses);
}

export async function collectAndRankTopCourses(
  page: Page,
  keyword: string,
  opts: {
    readonly filters: SearchFilters;
    readonly maxCourses: number;
    readonly maxPages: number;
    readonly throttleMs: number;
  },
  logger: Logger
): Promise<readonly CourseDetail[]> {
  const urls = await collectCourseUrlsForKeyword(page, keyword, opts, logger);

  if (urls.length === 0) {
    logger.info('Keyword completed with no course URLs found', { keyword, reason: 'no course URLs found' });
    return [];
  }

  const details: CourseDetail[] = [];
  const rejectionCounts = new Map<string, number>();

  for (const courseUrl of urls) {
    try {
      logger.debug('Detail extraction entrypoint', {
        keyword,
        courseUrl,
        extractor: 'src/udemy/extractCourseDetail.ts:extractCourseDetail'
      });
      await sleepMs(900);
      await gotoWithRetries(page, courseUrl, { operationName: 'openDetailPage', throttleMs: opts.throttleMs, logger });
      logger.info('Opening detail page', { keyword, courseUrl, currentUrl: page.url() });

      const extraction = await extractCourseDetail(page, keyword, courseUrl);
      if (!extraction.ok) {
        rejectionCounts.set('detail extraction failed', (rejectionCounts.get('detail extraction failed') ?? 0) + 1);
        logger.warn('Detail extraction failed', {
          keyword,
          courseUrl,
          reason: extraction.reason,
          diagnosticsUrl: extraction.diagnostics.url,
          diagnosticsTitle: extraction.diagnostics.title,
          primaryContainerSnippet: extraction.diagnostics.primaryContainerSnippet
        });
        continue;
      }

      const detail = extraction.data;
      logger.info('Extracting detail fields completed', {
        keyword,
        courseUrl,
        courseId: detail.courseId,
        title: detail.title
      });
      const eligibility = computeEligibility({
        rating: detail.rating,
        ratingCount: detail.ratingCount
      });

      logger.info('Computed filters', {
        keyword,
        courseUrl,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        rating: detail.rating,
        ratingCount: detail.ratingCount
      });

      logger.info('Detail extracted', {
        keyword,
        courseUrl,
        courseId: detail.courseId,
        title: detail.title,
        rating: detail.rating,
        ratingCount: detail.ratingCount,
        eligible: eligibility.eligible,
        reason: eligibility.reason
      });

      if (eligibility.eligible) {
        logger.info('Course accepted', { keyword, courseUrl, courseId: detail.courseId, title: detail.title });
        details.push(detail);
      } else {
        logger.info('Course rejected', { keyword, courseUrl, reason: eligibility.reason });
        if (eligibility.reason !== null) {
          rejectionCounts.set(eligibility.reason, (rejectionCounts.get(eligibility.reason) ?? 0) + 1);
        }
      }
    } catch (error) {
      rejectionCounts.set('detail extraction failed', (rejectionCounts.get('detail extraction failed') ?? 0) + 1);
      const slug = courseUrl.split('/course/')[1]?.split('/')[0] ?? 'course';
      await writeNavigationFailureArtifacts(page, `detail_${slug}`, courseUrl, error, keyword);
      logger.warn('Detail extraction failed', { keyword, courseUrl, error: String(error) });
    }
  }

  if (details.length === 0) {
    logger.info('Keyword completed with all courses filtered out', {
      keyword,
      reason: 'all filtered out',
      rejectionCounts: Object.fromEntries(rejectionCounts)
    });
  }

  return rankCourses(details).slice(0, 3);
}

export type FailureReason = 'rating_below_min' | 'rating_count_below_min';

export type Eligibility = Readonly<{
  eligible: boolean;
  reason: FailureReason | null;
}>;

export function computeEligibility(input: Readonly<{ rating: number | null; ratingCount: number | null }>): Eligibility {
  const minRating = 4.5;
  const minRatingCount = 1500;

  const rating = input.rating ?? 0;
  const ratingCount = input.ratingCount ?? 0;

  if (rating < minRating) {
    return { eligible: false, reason: 'rating_below_min' };
  }

  if (ratingCount < minRatingCount) {
    return { eligible: false, reason: 'rating_count_below_min' };
  }

  return { eligible: true, reason: null };
}

function rankCourses(courses: readonly CourseDetail[]): CourseDetail[] {
  return [...courses].sort((a, b) => {
    const ratingCmp = compareNumberDesc(a.rating, b.rating);
    if (ratingCmp !== 0) {
      return ratingCmp;
    }

    return compareNumberDesc(a.ratingCount, b.ratingCount);
  });
}

function compareNumberDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

async function waitForSearchResultsUi(page: Page, throttleMs: number, logger: Logger): Promise<void> {
  const preferred = page.locator('[data-purpose*="search-course-card" i] a[href], [data-purpose="search-course-card-title"]');
  const fallback = page.locator('a[href*="/course/"]');
  const deadline = Date.now() + RESULT_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if ((await preferred.count()) > 0 || (await fallback.count()) > 0) {
      return;
    }
    await throttled(() => page.waitForLoadState('networkidle', { timeout: 1_500 }), {
      operationName: 'waitForSearchResultsUi',
      throttleMs,
      logger
    }).catch(() => {});
  }

  await fallback.first().waitFor({ state: 'visible', timeout: 2_000 });
}

async function extractRenderedHrefs(page: Page): Promise<readonly string[]> {
  return page.locator('a[href]').evaluateAll((anchors) => {
    const hrefs: string[] = [];
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (href) {
        hrefs.push(href);
      }
    }
    return hrefs;
  });
}

export function canonicalizeUrl(rawHref: string, baseUrl: string): string | null {
  if (!rawHref.includes('/course/')) {
    return null;
  }

  try {
    const base = new URL(baseUrl);
    const parsed = new URL(rawHref, baseUrl);
    if (parsed.host !== base.host) {
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function collectSearchIteration(
  page: Page,
  keyword: string,
  unique: Set<CourseUrl>,
  maxCourses: number,
  logger: Logger,
  pageIndex: number
): Promise<{ readonly extractedCount: number; readonly addedCount: number; readonly courseLikeAnchorCount: number; readonly debug: HrefDebugDump }> {
  const rawHrefs = await extractRenderedHrefs(page);
  const courseLikeHrefs = rawHrefs.filter((href) => href.includes('/course/'));
  const extracted = new Set<CourseUrl>();

  for (const href of courseLikeHrefs) {
    const canonical = canonicalizeUrl(href, page.url());
    if (!canonical) {
      continue;
    }
    extracted.add(canonical);
  }

  const before = unique.size;
  for (const courseUrl of extracted) {
    if (unique.size >= maxCourses) {
      break;
    }
    unique.add(courseUrl);
  }
  const addedCount = unique.size - before;

  logger.info('Pagination attempt', {
    keyword,
    pageIndex,
    url: page.url(),
    totalAnchors: rawHrefs.length,
    courseLikeHrefCount: courseLikeHrefs.length,
    extracted: extracted.size,
    added: addedCount,
    totalUnique: unique.size
  });

  return {
    extractedCount: extracted.size,
    addedCount,
    courseLikeAnchorCount: await page.locator('a[href*="/course/"]').count(),
    debug: {
      hrefs: rawHrefs.slice(0, DEBUG_HREF_LIMIT),
      courseLikeHrefs: courseLikeHrefs.slice(0, DEBUG_HREF_LIMIT)
    }
  };
}

interface HrefDebugDump {
  readonly hrefs: readonly string[];
  readonly courseLikeHrefs: readonly string[];
}

async function tryLoadMoreResults(page: Page, keyword: string, pageIndex: number, logger: Logger, throttleMs: number): Promise<boolean> {
  const loadMoreCandidates = [
    page.getByRole('button', { name: /load more|show more/i }),
    page.locator('[data-purpose*="load-more" i], [data-purpose*="show-more" i]')
  ];

  try {
    for (const candidate of loadMoreCandidates) {
      const count = await candidate.count();
      for (let i = 0; i < count; i += 1) {
        const item = candidate.nth(i);
        if (await item.isVisible().catch(() => false) && await item.isEnabled().catch(() => false)) {
          await throttled(() => item.click({ timeout: 5_000 }), { operationName: 'loadMoreClick', throttleMs, logger });
          await sleepMs(800);
          logger.info('Load more action', { keyword, pageIndex, action: 'click' });
          return true;
        }
      }
    }

    await throttled(async () => page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
    }), { operationName: 'loadMoreScroll', throttleMs, logger });
    await sleepMs(800);
    logger.info('Load more action', { keyword, pageIndex, action: 'scroll' });
    return true;
  } catch (error) {
    await writeNavigationFailureArtifacts(page, 'search_load_more_fail', page.url(), error, keyword);
    logger.warn('Load more action failed', { keyword, pageIndex, error: String(error) });
    return false;
  }
}

async function waitForCourseAnchorGrowth(page: Page, previousCount: number, throttleMs: number, logger: Logger): Promise<boolean> {
  try {
    await throttled(() => page.waitForFunction(
      (count) => document.querySelectorAll('a[href*="/course/"]').length > count,
      previousCount,
      { timeout: LOAD_MORE_WAIT_TIMEOUT_MS }
    ), { operationName: 'waitForCourseAnchorGrowth', throttleMs, logger });
    return true;
  } catch {
    return false;
  }
}

async function dumpEmptySearchHtml(
  keyword: string,
  page: Page,
  html: string,
  logger: Logger,
  hrefDebug?: HrefDebugDump
): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeKeyword = keyword.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  const dir = path.join('artifacts', 'nav_failures');
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `search_${safeKeyword}_${ts}.html`);
  await fs.writeFile(outPath, html, 'utf-8');

  let hrefDumpPath = '';
  if (hrefDebug) {
    hrefDumpPath = path.join(dir, `search_${safeKeyword}_${ts}_hrefs.json`);
    await fs.writeFile(hrefDumpPath, JSON.stringify(hrefDebug, null, 2), 'utf-8');
  }

  logger.info('No search URLs found; dumped HTML', {
    keyword,
    currentUrl: page.url(),
    title: await page.title().catch(() => ''),
    htmlPath: outPath,
    hrefDumpPath
  });
}
