import path from 'node:path';
import readline from 'node:readline/promises';
import { chromium, BrowserContext, Page } from 'playwright';
import { Logger } from './logger.js';

export interface AuthSession {
  context: BrowserContext;
  page: Page;
}

export async function initAuthenticatedSession(
  profileDir: string,
  baseUrl: string,
  orgHomePath: string,
  headless: boolean,
  logger: Logger
): Promise<AuthSession> {
  const context = await chromium.launchPersistentContext(path.resolve(profileDir), {
    headless,
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(`${baseUrl}${orgHomePath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const isLoggedIn = await checkLoggedIn(page, baseUrl, orgHomePath);
  if (!isLoggedIn) {
    if (headless) {
      throw new Error('Not authenticated. Run first login with --headless=false to complete SSO manually.');
    }
    logger.info('Manual SSO required. Complete login in browser, then press ENTER here.');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    await rl.question('Press ENTER after SSO login succeeds in the opened browser...');
    rl.close();
    await page.goto(`${baseUrl}${orgHomePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const authenticated = await checkLoggedIn(page, baseUrl, orgHomePath);
    if (!authenticated) {
      throw new Error('Still not authenticated after manual login.');
    }
  }

  logger.info('Authenticated session ready.');
  return { context, page };
}

async function checkLoggedIn(page: Page, baseUrl: string, orgHomePath: string): Promise<boolean> {
  const current = page.url();
  if (!current.startsWith(baseUrl)) {
    return false;
  }

  if (current.includes('/join/login-popup') || current.includes('/organization/sso')) {
    return false;
  }

  if (current.includes(orgHomePath)) {
    return true;
  }

  const userMenu = page.locator('[data-purpose="user-dropdown"]');
  return userMenu.count().then((count: number) => count > 0).catch(() => false);
}
