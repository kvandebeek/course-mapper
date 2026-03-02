import { Page } from 'playwright';

export interface CourseDetail {
  readonly keyword: string;
  readonly courseId: number | null;
  readonly title: string;
  readonly url: string;
  readonly rating: number | null;
  readonly ratingCount: number | null;
  readonly lastUpdateDate: string | null;
  readonly publishedDate: string | null;
  readonly instructors: readonly string[];
}

interface RuntimeExtraction {
  title?: string;
  courseId?: number;
  rating?: number;
  ratingCount?: number;
  lastUpdateDate?: string;
  publishedDate?: string;
  instructors?: readonly string[];
  canonicalUrl?: string;
}

export async function extractCourseDetail(page: Page, keyword: string, courseUrl: string): Promise<CourseDetail> {
  const runtime = await page.evaluate(() => {
    const root = window as unknown as Record<string, unknown>;

    const visited = new WeakSet<object>();

    const findCourseObject = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      if (visited.has(value as object)) {
        return null;
      }
      visited.add(value as object);

      const obj = value as Record<string, unknown>;
      const hasCourseSignals = (
        typeof obj.title === 'string'
        && (typeof obj.id === 'number' || typeof obj.courseId === 'number' || typeof obj.avg_rating === 'number' || typeof obj.rating === 'number')
      );
      if (hasCourseSignals) {
        return obj;
      }

      for (const nested of Object.values(obj)) {
        const found = findCourseObject(nested);
        if (found) {
          return found;
        }
      }
      return null;
    };

    const courseObject = findCourseObject(root.UD);

    const metaContent = (selector: string): string | undefined => {
      const node = document.querySelector(selector);
      return node instanceof HTMLMetaElement ? node.content : undefined;
    };

    const parseInstructors = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      return value
        .map((entry) => {
          if (entry && typeof entry === 'object') {
            const obj = entry as Record<string, unknown>;
            return typeof obj.display_name === 'string' ? obj.display_name : null;
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));
    };

    if (!courseObject) {
      const fallback: RuntimeExtraction = {
        title: metaContent('meta[property=\"og:title\"]') ?? document.title
      };
      const fallbackCanonical = metaContent('meta[property=\"og:url\"]');
      if (fallbackCanonical) {
        fallback.canonicalUrl = fallbackCanonical;
      }
      return fallback;
    }

    const instructorNames = parseInstructors(courseObject.visible_instructors ?? courseObject.instructors);
    const result: RuntimeExtraction = {
      title: typeof courseObject.title === 'string' ? courseObject.title : document.title,
      instructors: instructorNames
    };

    const courseId = typeof courseObject.id === 'number' ? courseObject.id : typeof courseObject.courseId === 'number' ? courseObject.courseId : undefined;
    if (courseId !== undefined) { result.courseId = courseId; }
    const rating = parseNum(courseObject.avg_rating ?? courseObject.rating);
    if (rating !== undefined) { result.rating = rating; }
    const ratingCount = parseNum(courseObject.num_reviews ?? courseObject.rating_count);
    if (ratingCount !== undefined) { result.ratingCount = ratingCount; }
    const lastUpdateDate = toDateText(courseObject.last_update_date ?? courseObject.lastUpdateDate);
    if (lastUpdateDate) { result.lastUpdateDate = lastUpdateDate; }
    const publishedDate = toDateText(courseObject.published_time ?? courseObject.publishedDate);
    if (publishedDate) { result.publishedDate = publishedDate; }
    const canonical = metaContent('meta[property=\"og:url\"]');
    if (canonical) { result.canonicalUrl = canonical; }

    return result;

    function parseNum(input: unknown): number | undefined {
      if (typeof input === 'number') {
        return Number.isFinite(input) ? input : undefined;
      }
      if (typeof input === 'string') {
        const value = Number(input);
        return Number.isFinite(value) ? value : undefined;
      }
      return undefined;
    }

    function toDateText(input: unknown): string | undefined {
      return typeof input === 'string' && input.length > 0 ? input : undefined;
    }
  });

  const canonical = runtime.canonicalUrl && runtime.canonicalUrl.length > 0 ? runtime.canonicalUrl : courseUrl;

  return {
    keyword,
    courseId: runtime.courseId ?? null,
    title: runtime.title?.trim() || 'Untitled Course',
    url: canonical,
    rating: runtime.rating ?? null,
    ratingCount: runtime.ratingCount ?? null,
    lastUpdateDate: runtime.lastUpdateDate ?? null,
    publishedDate: runtime.publishedDate ?? null,
    instructors: runtime.instructors ?? []
  };
}
