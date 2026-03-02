/**
 * src/runtime/session.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { Browser, BrowserContext, Page } from 'playwright';
import { Logger } from '../logger.js';

export type RuntimeSession = {
  context: BrowserContext;
  page: Page;
  isClosed(): boolean;
  ensurePage(): Promise<Page>;
  close(): Promise<void>;
};

/**
 * createRuntimeSession: public helper used by other modules.
 */
export async function createRuntimeSession(context: BrowserContext, logger?: Logger): Promise<RuntimeSession> {
  let contextClosed = false;
  let browserDisconnected = false;
  const browser: Browser | null = context.browser();
  let currentPage = context.pages().find((candidate) => !candidate.isClosed()) ?? (await context.newPage());

  context.on('close', () => {
    contextClosed = true;
    logger?.warn('Runtime session context closed');
  });

  if (browser) {
    browser.on('disconnected', () => {
      browserDisconnected = true;
      logger?.warn('Runtime session browser disconnected');
    });
  }

/**
 * isClosed: internal utility for this module.
 */
  function isClosed(): boolean {
    if (contextClosed || browserDisconnected) {
      return true;
    }

    if (!browser) {
      return contextClosed;
    }

    return !browser.isConnected();
  }

/**
 * ensurePage: internal utility for this module.
 */
  async function ensurePage(): Promise<Page> {
    if (isClosed()) {
      throw new Error('Runtime session is closed');
    }

    if (!currentPage.isClosed()) {
      applyPageTimeouts(currentPage);
      return currentPage;
    }

    const existingOpenPage = context.pages().find((candidate) => !candidate.isClosed());
    if (existingOpenPage) {
      currentPage = existingOpenPage;
      applyPageTimeouts(existingOpenPage);
      return existingOpenPage;
    }

    currentPage = await context.newPage();
    applyPageTimeouts(currentPage);
    return currentPage;
  }

/**
 * close: internal utility for this module.
 */
  async function close(): Promise<void> {
    if (isClosed()) {
      return;
    }

    try {
      await context.close();
    } catch (error) {
      logger?.warn('Failed to close runtime session context cleanly', { error: String(error) });
    } finally {
      contextClosed = true;
    }
  }

  currentPage = await ensurePage();

  return {
    context,
    get page(): Page {
      return currentPage;
    },
    isClosed,
    ensurePage,
    close
  };
}

/**
 * applyPageTimeouts: internal utility for this module.
 */
function applyPageTimeouts(page: Page): void {
  page.setDefaultNavigationTimeout(60000);
  page.setDefaultTimeout(60000);
}
