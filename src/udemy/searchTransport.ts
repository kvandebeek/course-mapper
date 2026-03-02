import { Page, Response } from 'playwright';
import { tryExtractHits } from './types.js';

export interface SearchPayloadMatch {
  payload: unknown;
  responseUrl: string;
  status: number;
}

const SEARCH_ENDPOINT_HINTS = ['search', 'discover', 'graphql', 'api-2.0', 'browse'];

export function looksLikeSearchEndpoint(url: string): boolean {
  const normalized = url.toLowerCase();
  return SEARCH_ENDPOINT_HINTS.some((hint) => normalized.includes(hint));
}

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

export async function waitForSearchPayload(page: Page, timeoutMs = 60000): Promise<SearchPayloadMatch> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    const response = await page.waitForResponse(
      (candidate: Response) => candidate.ok() && looksLikeSearchEndpoint(candidate.url()),
      { timeout: remainingMs }
    );

    const payload = await safeJson(response);
    if (!payload) {
      continue;
    }

    const hits = tryExtractHits(payload);
    if (!hits || hits.length === 0) {
      continue;
    }

    return {
      payload,
      responseUrl: response.url(),
      status: response.status()
    };
  }

  throw new Error(`Timed out waiting for valid search payload after ${timeoutMs}ms`);
}
