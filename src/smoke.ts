import { createLogger } from './logger.js';
import { createSessionManager } from './runtime/sessionManager.js';

async function main(): Promise<void> {
  const logger = createLogger(true);
  const profileDir = process.env.SMOKE_PROFILE_DIR ?? './artifacts/profile-smoke';
  const headless = process.env.SMOKE_HEADLESS !== 'false';

  const manager = createSessionManager({
    profileDir,
    headless,
    logger
  });

  logger.info('Smoke: creating first session');
  const first = await manager.getOrCreateSession();
  await first.ensurePage();

  logger.info('Smoke: requesting second session (should reuse)');
  const second = await manager.getOrCreateSession();
  if (first.context !== second.context) {
    throw new Error('Expected getOrCreateSession() to reuse the active session.');
  }

  logger.info('Smoke: closing session');
  await manager.closeSession();

  logger.info('Smoke: requesting third session (should recreate)');
  const third = await manager.getOrCreateSession();
  if (third.context === first.context) {
    throw new Error('Expected getOrCreateSession() to create a new session after close.');
  }

  await manager.closeSession();
  logger.info('Smoke: passed');
}

main().catch((error) => {
  console.error('Smoke failed:', error);
  process.exitCode = 1;
});
