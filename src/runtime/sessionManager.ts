/**
 * src/runtime/sessionManager.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import * as path from 'node:path';
import { BrowserType, chromium } from 'playwright';
import { Logger } from '../logger.js';
import { BrowserChannel } from '../types.js';
import { createRuntimeSession, RuntimeSession } from './session.js';

interface SessionManagerOptions {
  browserType?: BrowserType;
  browserChannel: BrowserChannel;
  profileDir: string;
  headless: boolean;
  logger: Logger;
}

export interface SessionManager {
  getOrCreateSession(): Promise<RuntimeSession>;
  closeSession(): Promise<void>;
}

/**
 * createSessionManager: public helper used by other modules.
 */
export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const browserType = options.browserType ?? chromium;
  const profileDir = path.resolve(options.profileDir);
  let session: RuntimeSession | null = null;
  let creating: Promise<RuntimeSession> | null = null;

/**
 * createSession: internal utility for this module.
 */
  async function createSession(): Promise<RuntimeSession> {
    const preferredChannel = options.browserChannel === 'chromium' ? 'chrome' : options.browserChannel;

    options.logger.info('Creating persistent browser session', {
      profileDir,
      headless: options.headless,
      browserType: browserType.name(),
      browserChannel: preferredChannel
    });

    const launchOptions: Parameters<typeof browserType.launchPersistentContext>[1] = {
      headless: options.headless,
      viewport: { width: 1440, height: 900 },
      channel: preferredChannel,
      args: ['--disable-blink-features=AutomationControlled']
    };

    let context;
    try {
      context = await browserType.launchPersistentContext(profileDir, launchOptions);
    } catch (error) {
      options.logger.warn('Preferred browser channel unavailable; falling back to default Chromium channel', {
        preferredChannel,
        error: String(error)
      });
      context = await browserType.launchPersistentContext(profileDir, {
        headless: options.headless,
        viewport: { width: 1440, height: 900 },
        args: ['--disable-blink-features=AutomationControlled']
      });
    }

    const runtimeSession = await createRuntimeSession(context, options.logger);
    options.logger.info('Persistent browser session created', { profileDir, browserChannel: preferredChannel });
    return runtimeSession;
  }

/**
 * getOrCreateSession: internal utility for this module.
 */
  async function getOrCreateSession(): Promise<RuntimeSession> {
    if (session && !session.isClosed()) {
      options.logger.debug('Reusing active runtime session');
      return session;
    }

    if (session?.isClosed()) {
      options.logger.warn('Existing runtime session is closed; recreating');
      session = null;
    }

    if (creating) {
      options.logger.debug('Awaiting in-progress session creation');
      return creating;
    }

    creating = createSession()
      .then((created) => {
        session = created;
        return created;
      })
      .finally(() => {
        creating = null;
      });

    return creating;
  }

/**
 * closeSession: internal utility for this module.
 */
  async function closeSession(): Promise<void> {
    if (!session) {
      return;
    }

    const closing = session;
    session = null;
    await closing.close();
  }

  return {
    getOrCreateSession,
    closeSession
  };
}
