import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BrowserContext, Page } from 'playwright';

export type InstructionalLevel = 'all' | 'beginner' | 'intermediate' | 'expert';
export type SortOrder = 'relevance' | 'highest-rated' | 'most-reviewed' | 'newest';

export interface SearchFilters {
  readonly minRating?: number;
  readonly lang?: string;
  readonly instructionalLevels?: readonly InstructionalLevel[];
  readonly sort?: SortOrder;
}

export const UDEMY_ORIGIN = 'https://resillion.udemy.com' as const;

const BACKOFF_MS: readonly number[] = [0, 500, 1500];

export function buildSearchUrl(keyword: string, filters: SearchFilters): string {
  const url = new URL('/organization/search/', UDEMY_ORIGIN);
  url.searchParams.set('src', 'ukw');
  url.searchParams.set('q', keyword);

  if (typeof filters.minRating === 'number' && Number.isFinite(filters.minRating)) {
    const rounded = (Math.round(filters.minRating * 10) / 10).toFixed(1);
    url.searchParams.set('ratings', rounded);
  }

  if (filters.lang) {
    url.searchParams.set('lang', filters.lang);
  }

  if (filters.instructionalLevels && filters.instructionalLevels.length > 0) {
    for (const level of filters.instructionalLevels) {
      url.searchParams.append('instructional_level', level);
    }
  }

  if (filters.sort) {
    url.searchParams.set('sort', filters.sort);
  }

  return url.toString();
}

export function enforceSameTabNavigation(context: BrowserContext, page: Page): void {
  page.on('popup', (popupPage) => {
    void popupPage.close().catch(() => {});
  });

  context.on('page', (newPage) => {
    if (newPage !== page) {
      void newPage.close().catch(() => {});
    }
  });
}

export async function gotoWithRetries(page: Page, url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt += 1) {
    const delayMs = BACKOFF_MS[attempt] ?? 0;
    if (delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((currentUrl) => currentUrl.host === 'resillion.udemy.com', { timeout: 30000 });
      const currentUrl = page.url().toLowerCase();
      const title = (await page.title().catch(() => '')).toLowerCase();
      if (
        currentUrl.includes('/join/')
        || currentUrl.includes('/login')
        || currentUrl.includes('/sso')
        || title.includes('login')
      ) {
        throw new Error('Not authenticated');
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt === BACKOFF_MS.length - 1) {
        await writeNavigationFailureArtifacts(page, 'nav_fail', url, error);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Navigation failed');
}

export function buildPaginatedUrl(baseUrl: string, pageIndex: number, variant: 'p' | 'page' | 'pageNumber' | 'start', pageSize: number): string {
  const url = new URL(baseUrl);
  if (variant === 'start') {
    url.searchParams.set('start', String((pageIndex - 1) * pageSize));
  } else {
    url.searchParams.set(variant, String(pageIndex));
  }
  return url.toString();
}

function sanitizeToken(input: string): string {
  return input.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 80) || 'unknown';
}

export async function writeNavigationFailureArtifacts(page: Page, prefix: string, targetUrl: string, error: unknown, keyword?: string): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = sanitizeToken(`${prefix}_${keyword ?? 'na'}_${ts}`);
  const dir = path.join('artifacts', 'nav_failures');
  await fs.mkdir(dir, { recursive: true });
  const pngPath = path.join(dir, `${slug}.png`);
  const htmlPath = path.join(dir, `${slug}.html`);
  const txtPath = path.join(dir, `${slug}.txt`);

  if (!page.isClosed()) {
    await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    await fs.writeFile(htmlPath, html, 'utf-8').catch(() => {});
  }

  const context = `url=${targetUrl}\nkeyword=${keyword ?? ''}\nerror=${String(error)}\n`;
  await fs.writeFile(txtPath, context, 'utf-8').catch(() => {});
}
