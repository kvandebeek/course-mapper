import fs from 'node:fs/promises';
import path from 'node:path';
import { Page } from 'playwright';
import { Logger } from './logger.js';
import { RuntimeSession } from './runtime/session.js';
import { SearchResultPayload } from './types.js';
import { waitForSearchPayload } from './udemy/searchTransport.js';
import { UnknownRecord, isRecord, tryExtractHits } from './udemy/types.js';

interface SearchParams {
  maxCoursesPerKeyword: number;
  maxPages: number;
  throttleMs: number;
}

export async function scrapeKeywordCourses(
  session: RuntimeSession,
  baseUrl: string,
  keyword: string,
  params: SearchParams,
  logger: Logger
): Promise<SearchResultPayload[]> {
  const courseMap = new Map<string, SearchResultPayload>();

  for (let pageNum = 1; pageNum <= params.maxPages; pageNum += 1) {
    if (courseMap.size >= params.maxCoursesPerKeyword) {
      break;
    }

    const searchUrl = buildSearchUrl(baseUrl, keyword, pageNum);
    let pageSucceeded = false;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptStart = Date.now();
      const backoffMs = attempt === 2 ? 500 : attempt === 3 ? 1500 : 0;
      const traceFile = path.join(
        'artifacts',
        'debug',
        sanitizeKeyword(keyword),
        `page-${pageNum}-attempt-${attempt}.zip`
      );

      try {
        if (backoffMs > 0) {
          await delay(backoffMs);
        }

        const page = await session.ensurePage();
        await session.context.tracing.start({ screenshots: true, snapshots: true });

        logger.info('Navigating keyword search page', { keyword, pageNum, attempt, url: searchUrl });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const match = await waitForSearchPayload(page, 60000);
        const hits = tryExtractHits(match.payload) ?? [];
        const parsed = hits.map(mapHitToSearchPayload).filter((item): item is SearchResultPayload => item !== null);

        for (const entry of parsed) {
          if (!courseMap.has(entry.id)) {
            courseMap.set(entry.id, entry);
          }
        }

        await session.context.tracing.stop();

        logger.info('Search payload captured', {
          keyword,
          pageNum,
          attempt,
          responseUrl: match.responseUrl,
          responseStatus: match.status,
          extracted: parsed.length,
          totalUnique: courseMap.size
        });

        pageSucceeded = true;
        if (parsed.length === 0 && pageNum > 1) {
          break;
        }
        break;
      } catch (error) {
        const durationMs = Date.now() - attemptStart;
        const message = String(error);
        logger.warn('Keyword page attempt failed', {
          keyword,
          pageNum,
          attempt,
          durationMs,
          error: message
        });

        await captureDiagnostics(session.page, keyword, pageNum, attempt, traceFile, logger);
        await recoverFromPageOrContextClosure(session.page, message, logger);

        if (attempt === 3) {
          logger.error('Keyword page failed after retries', { keyword, pageNum, durationMs, error: message });
          break;
        }
      }
    }

    if (!pageSucceeded) {
      continue;
    }

    await delay(params.throttleMs);
  }

  return [...courseMap.values()].slice(0, params.maxCoursesPerKeyword);
}

async function recoverFromPageOrContextClosure(page: Page, errorMessage: string, logger: Logger): Promise<void> {
  const closedPage = page.isClosed();
  const closureError = errorMessage.toLowerCase().includes('context or browser has been closed');

  if (closedPage || closureError) {
    logger.warn('Page closed or invalidated; session will ensure page on next attempt');
  }
}

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

function buildSearchUrl(baseUrl: string, keyword: string, pageNum: number): string {
  const query = new URL('/organization/search/', baseUrl);
  query.searchParams.set('q', keyword);
  query.searchParams.set('p', String(pageNum));
  query.searchParams.set('src', 'ukw');
  return query.toString();
}

function mapHitToSearchPayload(course: UnknownRecord): SearchResultPayload | null {
  const idValue = course.id;
  const title = toString(course.title);
  const url = normalizeUrl(toString(course.url));

  if ((typeof idValue !== 'string' && typeof idValue !== 'number') || !title || !url) {
    return null;
  }

  const instructorsArray = Array.isArray(course.visible_instructors)
    ? course.visible_instructors.filter(isRecord)
    : [];

  const locale = isRecord(course.locale) ? toString(course.locale.locale) : '';

  return {
    id: String(idValue),
    url,
    title,
    instructors: instructorsArray
      .map((ins) => toString(ins.display_name))
      .filter((name) => name.length > 0)
      .join('; '),
    locale: locale || toString(course.locale_simple),
    rating: toNumber(course.rating),
    ratingCount: toNumber(course.num_reviews),
    level: toString(course.instructional_level_simple) || null
  };
}

function sanitizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'keyword';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

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

function normalizeUrl(url: string): string {
  if (!url) {
    return '';
  }
  if (url.startsWith('http')) {
    return url;
  }
  return `https://resillion.udemy.com${url.startsWith('/') ? '' : '/'}${url}`;
}
