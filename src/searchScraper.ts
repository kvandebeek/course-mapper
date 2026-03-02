import { Page, Response } from 'playwright';
import { Logger } from './logger.js';
import { SearchResultPayload } from './types.js';
import { withRetry } from './utils/retry.js';

interface SearchParams {
  maxCoursesPerKeyword: number;
  maxPages: number;
  throttleMs: number;
}

export async function scrapeKeywordCourses(
  page: Page,
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

    const query = new URL('/organization/search/', baseUrl);
    query.searchParams.set('q', keyword);
    query.searchParams.set('p', String(pageNum));
    query.searchParams.set('src', 'ukw');

    const captured: SearchResultPayload[] = [];
    const onResponse = async (response: Response): Promise<void> => {
      try {
        if (!response.url().includes('/api-2.0')) {
          return;
        }
        const json = (await response.json()) as unknown;
        const parsed = extractFromApiResponse(json);
        for (const item of parsed) {
          captured.push(item);
        }
      } catch {
        // ignore parsing issues for irrelevant responses
      }
    };

    page.on('response', onResponse);

    await withRetry(
      async () => {
        await page.goto(query.toString(), { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
      },
      2,
      500,
      (attempt, error) => {
        logger.warn('Retrying keyword page load', { keyword, pageNum, attempt, error: String(error) });
      }
    );

    const domExtracted = await extractFromNextData(page);
    for (const entry of [...captured, ...domExtracted]) {
      if (!courseMap.has(entry.id)) {
        courseMap.set(entry.id, entry);
      }
    }

    page.off('response', onResponse);

    logger.debug('Page parsed', { keyword, pageNum, captured: captured.length, totalUnique: courseMap.size });

    if (captured.length === 0 && domExtracted.length === 0 && pageNum > 1) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, params.throttleMs));
  }

  return [...courseMap.values()].slice(0, params.maxCoursesPerKeyword);
}

function extractFromApiResponse(payload: unknown): SearchResultPayload[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const objectPayload = payload as Record<string, unknown>;
  const results = objectPayload.results;
  if (!Array.isArray(results)) {
    return [];
  }

  const parsed: SearchResultPayload[] = [];
  for (const row of results) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const course = row as Record<string, unknown>;
    const idValue = course.id;
    const title = toString(course.title);
    const url = normalizeUrl(toString(course.url));
    if (typeof idValue !== 'number' && typeof idValue !== 'string') {
      continue;
    }
    if (!title || !url) {
      continue;
    }

    const instructorsArray = Array.isArray(course.visible_instructors)
      ? (course.visible_instructors as Array<Record<string, unknown>>)
      : [];

    parsed.push({
      id: String(idValue),
      url,
      title,
      instructors: instructorsArray
        .map((ins) => toString(ins.display_name))
        .filter((name) => name.length > 0)
        .join('; '),
      locale: toString((course.locale as Record<string, unknown> | undefined)?.locale) || toString(course.locale_simple),
      rating: toNumber(course.rating),
      ratingCount: toNumber(course.num_reviews),
      level: toString(course.instructional_level_simple) || null
    });
  }
  return parsed;
}

async function extractFromNextData(page: Page): Promise<SearchResultPayload[]> {
  const json = await page.locator('script#__NEXT_DATA__').first().textContent();
  if (!json) {
    return [];
  }

  const data = JSON.parse(json) as Record<string, unknown>;
  const props = data.props as Record<string, unknown> | undefined;
  const pageProps = props?.pageProps as Record<string, unknown> | undefined;
  const initial = pageProps?.initialState as Record<string, unknown> | undefined;
  const collections = findArrays(initial);

  const matches: SearchResultPayload[] = [];
  for (const collection of collections) {
    for (const row of collection) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const course = row as Record<string, unknown>;
      if (!('title' in course) || !('url' in course) || !('id' in course)) {
        continue;
      }
      const id = course.id;
      if (typeof id !== 'number' && typeof id !== 'string') {
        continue;
      }
      const title = toString(course.title);
      const url = normalizeUrl(toString(course.url));
      if (!title || !url) {
        continue;
      }
      matches.push({
        id: String(id),
        url,
        title,
        instructors: '',
        locale: toString((course.locale as Record<string, unknown> | undefined)?.locale),
        rating: toNumber(course.rating),
        ratingCount: toNumber(course.num_reviews),
        level: toString(course.instructional_level_simple) || null
      });
    }
  }

  return matches;
}

function findArrays(input: unknown): Array<Array<unknown>> {
  if (!input || typeof input !== 'object') {
    return [];
  }
  const arrays: Array<Array<unknown>> = [];
  const stack: unknown[] = [input];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      arrays.push(current);
      continue;
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      stack.push(value);
    }
  }

  return arrays;
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
