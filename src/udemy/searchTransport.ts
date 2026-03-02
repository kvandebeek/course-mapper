/**
 * src/udemy/searchTransport.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { Page, Response } from 'playwright';

interface CandidateApiResponse {
  readonly url: string;
  readonly status: number;
  readonly shape: string;
}

const EXCLUDED_API_PATTERNS = ['/structured-data/tags/', 'learning_path_folder'];
const URL_HINTS = ['search', 'courses', 'discovery', 'organization/search'];
const RESULT_KEYS = ['results', 'items', 'courses', 'count', 'next'];

/**
 * isCandidateApiUrl: public helper used by other modules.
 */
export function isCandidateApiUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  if (!normalized.includes('/api-2.0/')) {
    return false;
  }
  return !EXCLUDED_API_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * looksLikeSearchResultsUrl: public helper used by other modules.
 */
export function looksLikeSearchResultsUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return URL_HINTS.some((hint) => normalized.includes(hint));
}

/**
 * collectShape: internal utility for this module.
 */
function collectShape(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'unknown';
  }
  const keys = Object.keys(payload as Record<string, unknown>).slice(0, 6);
  return keys.join(',');
}

/**
 * payloadLooksLikeSearchResults: internal utility for this module.
 */
function payloadLooksLikeSearchResults(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return RESULT_KEYS.some((key) => key in record);
}

/**
 * urlPrefix: internal utility for this module.
 */
function urlPrefix(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/**
 * matchesPageForUrl: public helper used by other modules.
 */
export function matchesPageForUrl(url: string, pageNum: number): boolean {
  const parsed = new URL(url);
  const p = parsed.searchParams.get('p') ?? parsed.searchParams.get('page') ?? parsed.searchParams.get('offset');
  if (!p) {
    return true;
  }
  if (p === String(pageNum)) {
    return true;
  }
  const maybeOffset = Number(p);
  if (Number.isFinite(maybeOffset) && maybeOffset > 0 && pageNum > 1) {
    return true;
  }
  return false;
}

/**
 * safeJson: public helper used by other modules.
 */
export async function safeJson(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers()['content-type'];
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * sniffSearchResultsEndpoint: public helper used by other modules.
 */
export async function sniffSearchResultsEndpoint(page: Page, timeoutMs: number): Promise<readonly string[]> {
  const seen = new Map<string, CandidateApiResponse>();

  const listener = (response: Response): void => {
    const url = response.url();
    if (!isCandidateApiUrl(url)) {
      return;
    }

    const status = response.status();
    if (status < 200 || status > 499) {
      return;
    }

    if (!seen.has(url) && seen.size < 50) {
      seen.set(url, { url, status, shape: 'pending' });
    }
  };

  page.on('response', listener);
  await page.waitForTimeout(timeoutMs);
  page.off('response', listener);

  const enriched: CandidateApiResponse[] = [];
  for (const candidate of seen.values()) {
    const response = await page
      .context()
      .request.get(candidate.url)
      .catch(() => null);

    let shape = candidate.shape;
    if (response) {
      const payload = await response.json().catch(() => undefined);
      shape = collectShape(payload);
      if (!looksLikeSearchResultsUrl(candidate.url) && !payloadLooksLikeSearchResults(payload)) {
        continue;
      }
    }

    enriched.push({ ...candidate, shape });
  }

  enriched.sort((left, right) => {
    const leftScore = Number(looksLikeSearchResultsUrl(left.url));
    const rightScore = Number(looksLikeSearchResultsUrl(right.url));
    return rightScore - leftScore;
  });

  return enriched.map((item) => item.url);
}

/**
 * waitForResponseOrClose: public helper used by other modules.
 */
export async function waitForResponseOrClose(
  page: Page,
  predicate: (r: Response) => boolean,
  timeoutMs: number
): Promise<Response | null> {
  let resolved = false;

  const closedPromise = new Promise<null>((resolve) => {
    const resolveIfNeeded = (): void => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    };

    page.once('close', resolveIfNeeded);
    page.context().once('close', resolveIfNeeded);
    const browser = page.context().browser();
    browser?.once('disconnected', resolveIfNeeded);
  });

  const responsePromise = page
    .waitForResponse((response) => predicate(response), { timeout: timeoutMs })
    .then((response) => {
      resolved = true;
      return response;
    })
    .catch(() => null);

  return Promise.race([responsePromise, closedPromise]);
}

/**
 * buildResponsePredicate: public helper used by other modules.
 */
export function buildResponsePredicate(candidates: readonly string[], pageNum: number): (response: Response) => boolean {
  const candidatePrefixes = candidates.map(urlPrefix);
  return (response: Response): boolean => {
    const url = response.url();
    if (!isCandidateApiUrl(url)) {
      return false;
    }
    if (!candidatePrefixes.some((prefix) => url.startsWith(prefix))) {
      return false;
    }
    return matchesPageForUrl(url, pageNum);
  };
}

/**
 * summarizeCandidates: public helper used by other modules.
 */
export function summarizeCandidates(candidates: readonly string[]): readonly string[] {
  return candidates.slice(0, 5);
}
