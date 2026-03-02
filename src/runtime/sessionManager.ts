import path from 'node:path';
import { BrowserType, chromium } from 'playwright';
import { Logger } from '../logger.js';
import { createRuntimeSession, RuntimeSession } from './session.js';

interface SessionManagerOptions {
  browserType?: BrowserType;
  profileDir: string;
  headless: boolean;
  logger: Logger;
}

export interface SessionManager {
  getOrCreateSession(): Promise<RuntimeSession>;
  closeSession(): Promise<void>;
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const browserType = options.browserType ?? chromium;
  const profileDir = path.resolve(options.profileDir);
  let session: RuntimeSession | null = null;
  let creating: Promise<RuntimeSession> | null = null;

  async function createSession(): Promise<RuntimeSession> {
    options.logger.info('Creating persistent browser session', {
      profileDir,
      headless: options.headless,
      browserType: browserType.name()
    });

    const context = await browserType.launchPersistentContext(profileDir, {
      headless: options.headless,
      viewport: { width: 1440, height: 900 }
    });

    const runtimeSession = await createRuntimeSession(context, options.logger);
    options.logger.info('Persistent browser session created', { profileDir });
    return runtimeSession;
  }

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
