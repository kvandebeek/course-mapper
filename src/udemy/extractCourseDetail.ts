/**
 * Course detail extraction from Udemy course pages.
 *
 * Extraction strategy:
 * - Prefer structured payloads embedded in page scripts (`window.UD` and JSON-LD).
 * - Parse visible "total length" text for duration normalization.
 * - Return diagnostic metadata instead of throwing when payloads are missing, so the
 *   caller can record explicit rejection/failure reasons in the audit log.
 */

import { Page } from 'playwright';

export interface CourseDetail {
  readonly keyword: string;
  readonly courseId: number | null;
  readonly title: string;
  readonly url: string;
  readonly rating: number | null;
  readonly ratingCount: number | null;
  readonly durationHours: number | null;
  readonly durationMinutes: number | null;
  readonly durationTotalMinutes: number | null;
  readonly durationDisplay: string | null;
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

/**
 * extractCourseDetail: public helper used by other modules.
 */
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

/**
 * extractDetailFromScripts: internal utility for this module.
 */
async function extractDetailFromScripts(page: Page, keyword: string, courseUrl: string, pageTitle: string): Promise<CourseDetail | null> {
  const html = await page.content();
  const canonical = await page.locator('meta[property="og:url"]').first().getAttribute('content').catch(() => null);
  const ldJsonTexts = await page.locator('script[type="application/ld+json"]').allTextContents().catch(() => []);

  const ldCourse = parseLdCourse(ldJsonTexts);
  const runtimeCourse = parseUdRuntimePayload(html);
  const totalLengthLocator = page.getByText(/total length/i);
  const totalLengthCount = await totalLengthLocator.count().catch(() => 0);
  if (totalLengthCount > 1) {
    console.debug('[debug] Multiple total length matches found; using first', { courseUrl, totalLengthCount });
  }
  const totalLengthText = totalLengthCount > 0
    ? await totalLengthLocator.first().textContent().catch(() => null)
    : null;
  const parsedLength = parseUdemyTotalLength(totalLengthText ?? '');

  if (!parsedLength && totalLengthText) {
    console.debug('[debug] Unable to parse course duration', { courseUrl, rawText: totalLengthText.slice(0, 160) });
  }

  const title = firstNonEmpty(runtimeCourse?.title, ldCourse?.name, pageTitle, 'Untitled Course');
  const result: CourseDetail = {
    keyword,
    courseId: runtimeCourse?.courseId ?? null,
    title,
    url: firstNonEmpty(canonical ?? undefined, ldCourse?.url, courseUrl),
    rating: runtimeCourse?.rating ?? ldCourse?.ratingValue ?? null,
    ratingCount: runtimeCourse?.ratingCount ?? ldCourse?.ratingCount ?? null,
    durationHours: parsedLength?.hours ?? null,
    durationMinutes: parsedLength?.minutes ?? null,
    durationTotalMinutes: parsedLength?.totalMinutes ?? null,
    durationDisplay: parsedLength?.display ?? null
  };

  if (!runtimeCourse && !ldCourse) {
    return null;
  }

  return result;
}



export type ParsedUdemyTotalLength = Readonly<{
  hours: number;
  minutes: number;
  totalMinutes: number;
  display: string;
}>;

/**
 * parseUdemyTotalLength: public helper used by other modules.
 */
export function parseUdemyTotalLength(text: string): ParsedUdemyTotalLength | null {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    return null;
  }

  const [prefix] = normalizedText.split(/total length/i, 1);
  const source = (prefix ?? normalizedText).trim();
  if (source.length === 0) {
    return null;
  }

  const hoursMinutes = source.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hoursMinutes) {
    const hours = Number(hoursMinutes[1]);
    const minutes = Number(hoursMinutes[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }
    return {
      hours,
      minutes,
      totalMinutes: (hours * 60) + minutes,
      display: `${hours}h ${minutes}m`
    };
  }

  const minutesOnly = source.match(/(\d+)\s*m/i);
  if (minutesOnly) {
    const minutes = Number(minutesOnly[1]);
    if (!Number.isFinite(minutes)) {
      return null;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return {
      hours,
      minutes: remainder,
      totalMinutes: minutes,
      display: `${hours}h ${remainder}m`
    };
  }

  const hoursOnly = source.match(/(\d+)\s*h/i);
  if (hoursOnly) {
    const hours = Number(hoursOnly[1]);
    if (!Number.isFinite(hours)) {
      return null;
    }
    return {
      hours,
      minutes: 0,
      totalMinutes: hours * 60,
      display: `${hours}h 0m`
    };
  }

  return null;
}

interface ParsedLdCourse {
  name?: string;
  url?: string;
  ratingValue?: number;
  ratingCount?: number;
}

/**
 * parseLdCourse: internal utility for this module.
 */
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

/**
 * pickCourseObject: internal utility for this module.
 */
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

/**
 * parseUdRuntimePayload: internal utility for this module.
 */
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

/**
 * extractBalancedJson: internal utility for this module.
 */
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

/**
 * findCourseObject: internal utility for this module.
 */
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

/**
 * firstNonEmpty: internal utility for this module.
 */
function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

/**
 * toOptionalString: internal utility for this module.
 */
function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * toOptionalNumber: internal utility for this module.
 */
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

/**
 * asRecord: internal utility for this module.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

/**
 * isString: internal utility for this module.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
