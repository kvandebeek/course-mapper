/**
 * src/smoke.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { createLogger } from './logger.js';
import { createSessionManager } from './runtime/sessionManager.js';
import { extractCourseDetail } from './udemy/extractCourseDetail.js';

/**
 * main: internal utility for this module.
 */
async function main(): Promise<void> {
  const logger = createLogger(true);
  const profileDir = process.env.SMOKE_PROFILE_DIR ?? './artifacts/profile-smoke';
  const headless = process.env.SMOKE_HEADLESS !== 'false';

  const manager = createSessionManager({
    browserChannel: 'chrome',
    profileDir,
    headless,
    logger
  });

  logger.info('Smoke: creating first session');
  const first = await manager.getOrCreateSession();
  const firstPage = await first.ensurePage();

  logger.info('Smoke: requesting second session (should reuse)');
  const second = await manager.getOrCreateSession();
  if (first.context !== second.context) {
    throw new Error('Expected getOrCreateSession() to reuse the active session.');
  }

  const detailSmokeUrl = process.env.SMOKE_DETAIL_URL;
  if (detailSmokeUrl) {
    logger.info('Smoke: running detail extraction check', { detailSmokeUrl });
    await firstPage.goto(detailSmokeUrl, { waitUntil: 'domcontentloaded' });
    const extraction = await extractCourseDetail(firstPage, 'smoke', detailSmokeUrl);
    if (!extraction.ok) {
      throw new Error(`Detail extraction smoke failed: ${extraction.reason}`);
    }
    logger.info('Smoke: detail extraction check passed', {
      title: extraction.data.title,
      rating: extraction.data.rating,
      ratingCount: extraction.data.ratingCount
    });
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
