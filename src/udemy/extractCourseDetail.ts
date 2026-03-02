import { Page } from 'playwright';

export interface CourseDetail {
  readonly keyword: string;
  readonly courseId: number | null;
  readonly title: string;
  readonly url: string;
  readonly rating: number | null;
  readonly ratingCount: number | null;
}

interface RuntimeExtraction {
  title?: string;
  courseId?: number;
  rating?: number;
  ratingCount?: number;
  canonicalUrl?: string;
}

export type CourseDetailExtractionResult =
  | { readonly ok: true; readonly data: CourseDetail }
  | {
    readonly ok: false;
    readonly reason: string;
    readonly diagnostics: {
      readonly url: string;
      readonly title: string;
      readonly primaryContainerSnippet: string;
    };
  };

export async function extractCourseDetail(page: Page, keyword: string, courseUrl: string): Promise<CourseDetailExtractionResult> {
  const currentUrl = page.url();
  const pageTitle = await page.title().catch(() => '');
  const mainContainer = page.locator('main').first();
  const mainCount = await mainContainer.count().catch(() => 0);
  const primaryContainerSnippet = mainCount > 0
    ? await mainContainer.innerHTML().then((html) => html.slice(0, 1_200)).catch(() => '')
    : '';

  const detail = await extractDetailFromScripts(page, keyword, courseUrl, pageTitle);

  if (!detail) {
    return {
      ok: false,
      reason: 'missing_course_payload',
      diagnostics: {
        url: currentUrl,
        title: pageTitle,
        primaryContainerSnippet
      }
    };
  }

  return {
    ok: true,
    data: detail
  };
}

async function extractDetailFromScripts(page: Page, keyword: string, courseUrl: string, pageTitle: string): Promise<CourseDetail | null> {
  const html = await page.content();
  const canonical = await page.locator('meta[property="og:url"]').first().getAttribute('content').catch(() => null);
  const ldJsonTexts = await page.locator('script[type="application/ld+json"]').allTextContents().catch(() => []);

  const ldCourse = parseLdCourse(ldJsonTexts);
  const runtimeCourse = parseUdRuntimePayload(html);

  const title = firstNonEmpty(runtimeCourse?.title, ldCourse?.name, pageTitle, 'Untitled Course');
  const result: CourseDetail = {
    keyword,
    courseId: runtimeCourse?.courseId ?? null,
    title,
    url: firstNonEmpty(canonical ?? undefined, ldCourse?.url, courseUrl),
    rating: runtimeCourse?.rating ?? ldCourse?.ratingValue ?? null,
    ratingCount: runtimeCourse?.ratingCount ?? ldCourse?.ratingCount ?? null
  };

  if (!runtimeCourse && !ldCourse) {
    return null;
  }

  return result;
}

interface ParsedLdCourse {
  name?: string;
  url?: string;
  ratingValue?: number;
  ratingCount?: number;
}

function parseLdCourse(rawEntries: readonly string[]): ParsedLdCourse | null {
  for (const entry of rawEntries) {
    try {
      const parsed = JSON.parse(entry) as unknown;
      const candidate = pickCourseObject(parsed);
      if (!candidate) {
        continue;
      }

      const aggregate = asRecord(candidate.aggregateRating);
      const result: ParsedLdCourse = {};
      const name = toOptionalString(candidate.name);
      if (name) { result.name = name; }
      const url = toOptionalString(candidate.url);
      if (url) { result.url = url; }
      const ratingValue = toOptionalNumber(aggregate?.ratingValue);
      if (ratingValue !== undefined) { result.ratingValue = ratingValue; }
      const ratingCount = toOptionalNumber(aggregate?.ratingCount);
      if (ratingCount !== undefined) { result.ratingCount = ratingCount; }
      return result;
    } catch {
      continue;
    }
  }

  return null;
}

function pickCourseObject(parsed: unknown): Record<string, unknown> | null {
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const found = pickCourseObject(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  const obj = asRecord(parsed);
  if (!obj) {
    return null;
  }

  const type = obj['@type'];
  if (type === 'Course') {
    return obj;
  }

  const graph = obj['@graph'];
  if (Array.isArray(graph)) {
    return pickCourseObject(graph);
  }

  return null;
}

function parseUdRuntimePayload(html: string): RuntimeExtraction | null {
  const marker = 'window.UD';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const assignmentIndex = html.indexOf('=', markerIndex);
  if (assignmentIndex < 0) {
    return null;
  }

  const start = html.indexOf('{', assignmentIndex);
  if (start < 0) {
    return null;
  }

  const jsonPayload = extractBalancedJson(html, start);
  if (!jsonPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    const courseObject = findCourseObject(parsed);
    if (!courseObject) {
      return null;
    }

    const result: RuntimeExtraction = {};
    const title = toOptionalString(courseObject.title);
    if (title) { result.title = title; }
    const courseId = toOptionalNumber(courseObject.id) ?? toOptionalNumber(courseObject.courseId);
    if (courseId !== undefined) { result.courseId = courseId; }
    const rating = toOptionalNumber(courseObject.avg_rating) ?? toOptionalNumber(courseObject.rating);
    if (rating !== undefined) { result.rating = rating; }
    const ratingCount = toOptionalNumber(courseObject.num_reviews) ?? toOptionalNumber(courseObject.rating_count);
    if (ratingCount !== undefined) { result.ratingCount = ratingCount; }
    return result;
  } catch {
    return null;
  }
}

function extractBalancedJson(input: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < input.length; i += 1) {
    const char = input[i];
    if (!char) {
      break;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

function findCourseObject(input: unknown): Record<string, unknown> | null {
  const stack: unknown[] = [input];
  const visited = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const obj = current as Record<string, unknown>;
    if (typeof obj.title === 'string' && (
      typeof obj.id === 'number' ||
      typeof obj.courseId === 'number' ||
      typeof obj.avg_rating === 'number' ||
      typeof obj.rating === 'number'
    )) {
      return obj;
    }

    for (const value of Object.values(obj)) {
      stack.push(value);
    }
  }

  return null;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
