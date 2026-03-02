import { UDEMY_ORIGIN } from './navigation.js';

export interface SearchParseResult {
  readonly courseUrls: readonly string[];
  readonly debug: {
    readonly totalAnchors: number;
    readonly matched: number;
  };
}

const ANCHOR_HREF_RE = /<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi;
const COURSE_ROOT_RE = /^\/course\/([^/?#]+)\/?$/;

export function extractCourseDetailUrlsFromSearchHtml(html: string): SearchParseResult {
  const urls: string[] = [];
  const seen = new Set<string>();
  let totalAnchors = 0;
  let matched = 0;

  let match: RegExpExecArray | null;
  while ((match = ANCHOR_HREF_RE.exec(html)) !== null) {
    totalAnchors += 1;
    const href = match[2];
    if (!href) {
      continue;
    }

    const normalizedPath = normalizeCoursePath(href);
    if (!normalizedPath) {
      continue;
    }

    matched += 1;
    const absoluteUrl = `${UDEMY_ORIGIN}${normalizedPath}`;
    if (!seen.has(absoluteUrl)) {
      seen.add(absoluteUrl);
      urls.push(absoluteUrl);
    }
  }

  return {
    courseUrls: urls,
    debug: {
      totalAnchors,
      matched
    }
  };
}

function normalizeCoursePath(href: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href, UDEMY_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== UDEMY_ORIGIN) {
    return null;
  }

  const courseMatch = COURSE_ROOT_RE.exec(parsed.pathname);
  if (!courseMatch || !courseMatch[1]) {
    return null;
  }

  return `/course/${courseMatch[1]}/`;
}
