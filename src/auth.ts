import readline from 'node:readline/promises';
import { Logger } from './logger.js';
import { RuntimeSession } from './runtime/session.js';
import { SessionManager } from './runtime/sessionManager.js';

export async function initAuthenticatedSession(
  sessionManager: SessionManager,
  baseUrl: string,
  orgHomePath: string,
  headless: boolean,
  logger: Logger
): Promise<RuntimeSession> {
  const session = await sessionManager.getOrCreateSession();
  const page = await session.ensurePage();

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
  return session;
}

async function checkLoggedIn(page: RuntimeSession['page'], baseUrl: string, orgHomePath: string): Promise<boolean> {
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
