import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { createLogger } from './logger.js';
import { loadKeywords } from './keywordLoader.js';
import { initAuthenticatedSession } from './auth.js';
import { scrapeKeywordCourses } from './searchScraper.js';
import { enrichCourses } from './courseEnricher.js';
import { filterCourses } from './filter.js';
import { scoreAndSelectTopThree } from './scoring.js';
import { writeOutputCsv } from './csvWriter.js';
import { CourseScored } from './types.js';
import { createSessionManager } from './runtime/sessionManager.js';

function printHelp(): void {
  console.log(`Udemy Business scraper options:
  --headless=true|false
  --debug=true|false
  --browserChannel=chrome|msedge|chromium (default: chrome)
  --maxCoursesPerKeyword=<number>
  --maxPages=<number>
  --throttleMs=<number>
  --concurrency=<number> (default: 1)
  --profileDir=<path>`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }
  const cli = getCliOptions(process.argv);
  const config = getAppConfig();
  const logger = createLogger(cli.debug);
  const totalStart = Date.now();
  const sessionManager = createSessionManager({
    browserChannel: cli.browserChannel,
    profileDir: cli.profileDir,
    headless: cli.headless,
    logger
  });

  logger.info('Starting scraper', { cli });

  const keywords = await loadKeywords(resolvePath(config.inputCsvPath));
  logger.info('Loaded keywords', { count: keywords.length });

  let session = await initAuthenticatedSession(sessionManager, config.baseUrl, config.orgHomePath, cli.headless, logger);

  const finalRows: CourseScored[] = [];

  for (const keywordRow of keywords) {
    const start = Date.now();
    try {
      logger.info('Keyword processing started', { keyword: keywordRow.keyword });
      session = await sessionManager.getOrCreateSession();

      const scrapeResult = await scrapeKeywordCourses(
        session,
        config.baseUrl,
        keywordRow.keyword,
        {
          maxCoursesPerKeyword: cli.maxCoursesPerKeyword,
          maxPages: cli.maxPages,
          throttleMs: cli.throttleMs
        },
        logger
      );

      const enriched = await enrichCourses(session.context, keywordRow.keyword, [...scrapeResult.courses], cli.concurrency, logger);
      const filtered = filterCourses(enriched, config);
      const topThree = scoreAndSelectTopThree(filtered, keywordRow);
      if (topThree.length === 0 && scrapeResult.failureReason) {
        finalRows.push({
          track: keywordRow.track,
          level: keywordRow.level,
          moduleType: keywordRow.moduleType,
          keyword: keywordRow.keyword,
          courseId: '',
          url: '',
          title: '',
          instructors: '',
          language: '',
          durationMinutes: null,
          udemyLevel: null,
          category: null,
          rating: null,
          ratingCount: null,
          lastUpdated: null,
          score: 0,
          badges: [],
          failureReason: scrapeResult.failureReason
        });
      }
      finalRows.push(...topThree);

      logger.info('Keyword processing completed', {
        keyword: keywordRow.keyword,
        fetched: scrapeResult.courses.length,
        filtered: filtered.length,
        exported: topThree.length,
        failureReason: scrapeResult.failureReason,
        durationMs: Date.now() - start
      });
    } catch (error) {
      logger.error('Keyword failed; continuing', {
        keyword: keywordRow.keyword,
        durationMs: Date.now() - start,
        error: String(error)
      });

      const shouldRecreate = String(error).toLowerCase().includes('context') || session.isClosed();
      if (shouldRecreate) {
        logger.warn('Keyword failure triggered session recreation', { keyword: keywordRow.keyword });
        try {
          await sessionManager.closeSession();
          session = await initAuthenticatedSession(sessionManager, config.baseUrl, config.orgHomePath, cli.headless, logger);
          logger.info('Session recreated after keyword failure');
        } catch (recreateError) {
          logger.error('Failed to recreate session', { error: String(recreateError) });
        }
      }

      if (cli.debug) {
        logger.debug('Failure details', { stack: error instanceof Error ? error.stack : String(error) });
      }
    }
  }

  await writeOutputCsv(resolvePath(config.outputCsvPath), finalRows);
  logger.info('Run complete', {
    rows: finalRows.length,
    output: config.outputCsvPath,
    totalDurationMs: Date.now() - totalStart
  });

  if (!cli.debug) {
    await sessionManager.closeSession();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
