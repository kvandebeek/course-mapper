/**
 * src/courseEnricher.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { BrowserContext } from 'playwright';
import { Logger } from './logger.js';
import { CourseRaw, SearchResultPayload } from './types.js';
import { withRetry } from './utils/retry.js';

/**
 * enrichCourses: public helper used by other modules.
 */
export async function enrichCourses(
  context: BrowserContext,
  keyword: string,
  courses: SearchResultPayload[],
  concurrency: number,
  logger: Logger
): Promise<CourseRaw[]> {
  const queue = [...courses];
  const results: CourseRaw[] = [];

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        return;
      }

      try {
        const enriched = await withRetry(
          async () => fetchCourseDetails(context, keyword, item),
          2,
          400,
          (attempt, error) => {
            logger.warn('Retrying course enrichment', {
              keyword,
              courseId: item.id,
              attempt,
              error: String(error)
            });
          }
        );
        results.push(enriched);
      } catch (error) {
        logger.warn('Course enrichment failed; using partial data', {
          keyword,
          courseId: item.id,
          error: String(error)
        });
        results.push(mapFallback(keyword, item));
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * fetchCourseDetails: internal utility for this module.
 */
async function fetchCourseDetails(
  context: BrowserContext,
  keyword: string,
  item: SearchResultPayload
): Promise<CourseRaw> {
  const endpoint = `https://resillion.udemy.com/api-2.0/courses/${item.id}/?fields[course]=title,url,headline,locale,avg_rating,num_reviews,instructional_level,content_info,estimated_content_length,primary_category,primary_subcategory,badge_family`; 
  const response = await context.request.get(endpoint, {
    headers: {
      referer: item.url
    }
  });

  if (!response.ok()) {
    throw new Error(`Course detail request failed with ${response.status()}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const localeObj = payload.locale as Record<string, unknown> | undefined;
  const category = toString((payload.primary_subcategory as Record<string, unknown> | undefined)?.title)
    || toString((payload.primary_category as Record<string, unknown> | undefined)?.title)
    || null;

  const badges = Array.isArray(payload.badge_family)
    ? (payload.badge_family as Array<Record<string, unknown>>)
        .map((badge) => toString(badge.title))
        .filter((title) => title.length > 0)
    : [];

  const durationMinutes = extractDurationMinutes(payload.estimated_content_length, payload.content_info);

  return {
    keyword,
    courseId: item.id,
    url: toString(payload.url) || item.url,
    title: toString(payload.title) || item.title,
    language: toString(localeObj?.locale) || item.locale,
    durationMinutes,
    udemyLevel: toString(payload.instructional_level) || item.level,
    category,
    rating: toNumber(payload.avg_rating) ?? item.rating,
    ratingCount: toNumber(payload.num_reviews) ?? item.ratingCount,
    badges
  };
}

/**
 * mapFallback: internal utility for this module.
 */
function mapFallback(keyword: string, item: SearchResultPayload): CourseRaw {
  return {
    keyword,
    courseId: item.id,
    url: item.url,
    title: item.title,
    language: item.locale,
    durationMinutes: null,
    udemyLevel: item.level,
    category: null,
    rating: item.rating,
    ratingCount: item.ratingCount,
    badges: []
  };
}

/**
 * extractDurationMinutes: internal utility for this module.
 */
function extractDurationMinutes(estimatedContentLength: unknown, contentInfo: unknown): number | null {
  const seconds = toNumber(estimatedContentLength);
  if (seconds && seconds > 0) {
    return Math.round(seconds / 60);
  }
  if (typeof contentInfo === 'string') {
    const match = contentInfo.match(/(\d+(?:\.\d+)?)\s*total\s*hours/i);
    if (match?.[1]) {
      return Math.round(Number(match[1]) * 60);
    }
  }
  return null;
}

/**
 * toNumber: internal utility for this module.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * toString: internal utility for this module.
 */
function toString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
