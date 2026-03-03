/**
 * src/udemy/scrapeKeyword.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Page } from 'playwright';
import { Logger } from '../logger.js';
import { extractCourseDetail, CourseDetail } from './extractCourseDetail.js';
import { CareerLevel, CourseInstructionalLevel, LEVEL_TO_INSTRUCTIONAL } from '../levels/careerLevel.js';
import { scoreCourseForCareerLevel } from '../scoring/courseScorer.js';
import {
  InstructionalLevel,
  SearchFilters,
  buildSearchUrl,
  gotoWithRetries,
  writeNavigationFailureArtifacts
} from './navigation.js';
import { sleepLogged, throttled } from '../utils/throttle.js';
import { isBlockedByKeyword } from './blockedKeywords.js';

const RESULT_WAIT_TIMEOUT_MS = 25_000;
const LOAD_MORE_WAIT_TIMEOUT_MS = 10_000;
const DEBUG_HREF_LIMIT = 30;

export type CourseUrl = string;

export const REJECTION_REASON = {
  RATING_BELOW_MIN: 'rating_below_min',
  RATING_COUNT_BELOW_MIN: 'rating_count_below_min',
  BLOCKED_KEYWORD: 'blocked_keyword'
} as const;

const LOG_EVENT = {
  COURSE_REJECTED: 'Course rejected'
} as const;

export const DEFAULT_FILTERS: SearchFilters = {
  minRating: 4.6,
  lang: 'en',
  durations: ['extraShort', 'short', 'medium', 'long'],
  sort: 'relevance'
};

export type AllowedInstructionalLevel = Exclude<InstructionalLevel, 'all'>;

export type CourseEligibilityContext = Readonly<{
  instructionalLevel: CourseInstructionalLevel;
}>;

export type DiscoveredCourseCandidate = Readonly<{
  courseUrl: CourseUrl;
  eligibilityContext: CourseEligibilityContext;
}>;

export type RankedCourseDetail = CourseDetail & Readonly<{
  instructionalLevel: CourseInstructionalLevel;
  score: number;
}>;

/**
 * collectCourseUrlsForKeyword: public helper used by other modules.
 */
export async function collectCourseUrlsForKeyword(
  page: Page,
  keyword: string,
  opts: {
    readonly filters: SearchFilters;
    readonly allowedInstructionalLevels?: readonly AllowedInstructionalLevel[];
    readonly maxCourses: number;
    readonly maxPages: number;
    readonly throttleMs: number;
  },
  logger: Logger
): Promise<readonly DiscoveredCourseCandidate[]> {
  const mergedFilters: SearchFilters = opts.allowedInstructionalLevels && opts.allowedInstructionalLevels.length > 0
    ? { ...opts.filters, instructionalLevels: opts.allowedInstructionalLevels }
    : opts.filters;
  const searchInstructionalLevel = mergedFilters.instructionalLevels?.[0] ?? null;
  if (!searchInstructionalLevel || searchInstructionalLevel === 'all') {
    throw new Error('collectCourseUrlsForKeyword requires exactly one instructional level per search pass');
  }
  const baseSearchUrl = buildSearchUrl(keyword, mergedFilters);
  logger.info('Keyword URL collection started', { keyword, baseSearchUrl });

  const unique = new Map<CourseUrl, DiscoveredCourseCandidate>();
  logger.info('Applying instructional_level search filter', { keyword, instructionalLevel: searchInstructionalLevel });

  try {
    await gotoWithRetries(page, baseSearchUrl, { operationName: 'openSearchPage', throttleMs: opts.throttleMs, logger });
    await sleepLogged(1200, logger, 'post-search-page-buffer', 'openSearchPage');
    await waitForSearchResultsUi(page, opts.throttleMs, logger);
  } catch (error) {
    await writeNavigationFailureArtifacts(page, 'search_nav_fail', baseSearchUrl, error, keyword);
    logger.warn('Search navigation failed', { keyword, url: baseSearchUrl, error: String(error) });
    return [];
  }

  for (let pageIndex = 1; pageIndex <= opts.maxPages; pageIndex += 1) {
    const iteration = await collectSearchIteration(
      page,
      keyword,
      unique,
      opts.maxCourses,
      logger,
      pageIndex,
      { instructionalLevel: searchInstructionalLevel }
    );
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

  return [...unique.values()].slice(0, opts.maxCourses);
}

/**
 * collectAndRankTopCourses: public helper used by other modules.
 */
export async function collectAndRankTopCourses(
  page: Page,
  keyword: string,
  careerLevel: CareerLevel,
  opts: {
    readonly filters: SearchFilters;
    readonly allowedInstructionalLevels?: readonly AllowedInstructionalLevel[];
    readonly maxCourses: number;
    readonly maxPages: number;
    readonly throttleMs: number;
  },
  logger: Logger
): Promise<readonly RankedCourseDetail[]> {
  const allowedInstructionalLevels = opts.allowedInstructionalLevels && opts.allowedInstructionalLevels.length > 0
    ? opts.allowedInstructionalLevels
    : LEVEL_TO_INSTRUCTIONAL[careerLevel];

  logger.debug('Keyword instructional mapping', { keyword, careerLevel, allowedInstructionalLevels });

  const discoveredCourses: DiscoveredCourseCandidate[] = [];
  for (const instructionalLevel of allowedInstructionalLevels) {
    const levelFilters = { ...opts, allowedInstructionalLevels: [instructionalLevel] as const };
    const candidates = await collectCourseUrlsForKeyword(page, keyword, levelFilters, logger);
    logger.debug('Instructional-level pass collected', { keyword, instructionalLevel, searchUrl: buildSearchUrl(keyword, { ...opts.filters, instructionalLevels: [instructionalLevel] }), discoveredCount: candidates.length });
    discoveredCourses.push(...candidates);
  }

  if (discoveredCourses.length === 0) {
    logger.info('Keyword completed with no course URLs found', { keyword, reason: 'no course URLs found' });
    return [];
  }

  const detailCache = new Map<string, CourseDetail>();
  const rankedCourses: RankedCourseDetail[] = [];
  const rejectionCounts = new Map<string, number>();

  for (const discoveredCourse of discoveredCourses) {
      const { courseUrl, eligibilityContext } = discoveredCourse;
      try {
      logger.debug('Detail extraction entrypoint', {
        keyword,
        courseUrl,
        extractor: 'src/udemy/extractCourseDetail.ts:extractCourseDetail'
      });
      let detail = detailCache.get(courseUrl);
      if (!detail) {
        await sleepLogged(900, logger, 'pre-detail-navigation', 'openDetailPage');
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

        detail = extraction.data;
        detailCache.set(courseUrl, detail);
      }

      logger.info('Extracting detail fields completed', {
        keyword,
        courseUrl,
        courseId: detail.courseId,
        title: detail.title
      });

      const blockedByKeyword = isBlockedByKeyword(detail.title);
      if (blockedByKeyword.blocked) {
        rejectionCounts.set(REJECTION_REASON.BLOCKED_KEYWORD, (rejectionCounts.get(REJECTION_REASON.BLOCKED_KEYWORD) ?? 0) + 1);
        logger.info(LOG_EVENT.COURSE_REJECTED, {
          keyword,
          courseUrl,
          reason: REJECTION_REASON.BLOCKED_KEYWORD,
          matchedKeyword: blockedByKeyword.matched
        });
        continue;
      }

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
        const scoreResult = scoreCourseForCareerLevel(careerLevel, {
          rating: detail.rating ?? 0,
          ratingCount: detail.ratingCount ?? 0,
          instructionalLevel: eligibilityContext.instructionalLevel,
          courseUrl,
          courseTitle: detail.title
        });

        if (scoreResult.isRejected) {
          rejectionCounts.set('instructional level mismatch', (rejectionCounts.get('instructional level mismatch') ?? 0) + 1);
          logger.info(LOG_EVENT.COURSE_REJECTED, { keyword, courseUrl, reason: 'instructional level mismatch' });
          continue;
        }

        logger.info('Course accepted', { keyword, courseUrl, courseId: detail.courseId, title: detail.title });
        rankedCourses.push({
          ...detail,
          instructionalLevel: eligibilityContext.instructionalLevel,
          score: scoreResult.score
        });
        logger.debug('Course score breakdown', {
          keyword,
          courseUrl,
          score: scoreResult.score,
          reasons: scoreResult.reasons
        });
      } else {
        logger.info(LOG_EVENT.COURSE_REJECTED, { keyword, courseUrl, reason: eligibility.reason });
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

  const dedupedRankedCourses = dedupeRankedCoursesByUrl(rankedCourses);

  if (dedupedRankedCourses.length === 0) {
    logger.info('Keyword completed with all courses filtered out', {
      keyword,
      reason: 'all filtered out',
      rejectionCounts: Object.fromEntries(rejectionCounts)
    });
  }

  const sorted = rankCourses(dedupedRankedCourses).slice(0, opts.maxCourses);
  for (const course of sorted.slice(0, 5)) {
    logger.debug('Top candidate after scoring', {
      keyword,
      courseUrl: course.url,
      score: course.score,
      instructionalLevel: course.instructionalLevel,
      rating: course.rating,
      ratingCount: course.ratingCount
    });
  }

  return sorted;
}

export type FailureReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON];

export type Eligibility = Readonly<{
  eligible: boolean;
  reason: FailureReason | null;
}>;

/**
 * computeEligibility: public helper used by other modules.
 */
export function computeEligibility(
  input: Readonly<{
    rating: number | null;
    ratingCount: number | null;
  }>
): Eligibility {
  const minRating = 4.5;
  const minRatingCount = 1500;

  const rating = input.rating ?? 0;
  const ratingCount = input.ratingCount ?? 0;

  if (rating < minRating) {
    return { eligible: false, reason: REJECTION_REASON.RATING_BELOW_MIN };
  }

  if (ratingCount < minRatingCount) {
    return { eligible: false, reason: REJECTION_REASON.RATING_COUNT_BELOW_MIN };
  }

  return { eligible: true, reason: null };
}

/**
 * rankCourses: internal utility for this module.
 */
function rankCourses(courses: readonly RankedCourseDetail[]): RankedCourseDetail[] {
  return [...courses].sort((a, b) => {
    const scoreCmp = compareNumberDesc(a.score, b.score);
    if (scoreCmp !== 0) {
      return scoreCmp;
    }

    const ratingCmp = compareNumberDesc(a.rating, b.rating);
    if (ratingCmp !== 0) {
      return ratingCmp;
    }

    const ratingCountCmp = compareNumberDesc(a.ratingCount, b.ratingCount);
    if (ratingCountCmp !== 0) {
      return ratingCountCmp;
    }

    return a.url.localeCompare(b.url);
  });
}

function dedupeRankedCoursesByUrl(courses: readonly RankedCourseDetail[]): RankedCourseDetail[] {
  const sorted = rankCourses(courses);
  const byUrl = new Map<string, RankedCourseDetail>();

  for (const course of sorted) {
    if (!byUrl.has(course.url)) {
      byUrl.set(course.url, course);
    }
  }

  return [...byUrl.values()];
}

/**
 * compareNumberDesc: internal utility for this module.
 */
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

/**
 * waitForSearchResultsUi: internal utility for this module.
 */
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

/**
 * extractRenderedHrefs: internal utility for this module.
 */
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

/**
 * canonicalizeUrl: public helper used by other modules.
 */
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

/**
 * collectSearchIteration: internal utility for this module.
 */
async function collectSearchIteration(
  page: Page,
  keyword: string,
  unique: Map<CourseUrl, DiscoveredCourseCandidate>,
  maxCourses: number,
  logger: Logger,
  pageIndex: number,
  eligibilityContext: CourseEligibilityContext
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
    if (!unique.has(courseUrl)) {
      unique.set(courseUrl, {
        courseUrl,
        eligibilityContext
      });
    }
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

/**
 * tryLoadMoreResults: internal utility for this module.
 */
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
          await sleepLogged(800, logger, 'post-load-more-click', 'loadMoreClick');
          logger.info('Load more action', { keyword, pageIndex, action: 'click' });
          return true;
        }
      }
    }

    await throttled(async () => page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
    }), { operationName: 'loadMoreScroll', throttleMs, logger });
    await sleepLogged(800, logger, 'post-load-more-scroll', 'loadMoreScroll');
    logger.info('Load more action', { keyword, pageIndex, action: 'scroll' });
    return true;
  } catch (error) {
    await writeNavigationFailureArtifacts(page, 'search_load_more_fail', page.url(), error, keyword);
    logger.warn('Load more action failed', { keyword, pageIndex, error: String(error) });
    return false;
  }
}

/**
 * waitForCourseAnchorGrowth: internal utility for this module.
 */
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

/**
 * dumpEmptySearchHtml: internal utility for this module.
 */
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
