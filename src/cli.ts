import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { createLogger } from './logger.js';
import { loadKeywords } from './keywordLoader.js';
import { initAuthenticatedSession } from './auth.js';
import { writeOutputCsv } from './csvWriter.js';
import { ExportRow } from './types.js';
import { createSessionManager } from './runtime/sessionManager.js';
import { DEFAULT_FILTERS, collectAndRankTopCourses } from './udemy/scrapeKeyword.js';
import { enforceSameTabNavigation } from './udemy/navigation.js';

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
  const page = await session.ensurePage();
  enforceSameTabNavigation(session.context, page);

  const finalRows: ExportRow[] = [];

  for (const keywordRow of keywords) {
    const start = Date.now();
    logger.info('Keyword processing started', { keyword: keywordRow.keyword });

    try {
      session = await sessionManager.getOrCreateSession();
      const runtimePage = await session.ensurePage();
      enforceSameTabNavigation(session.context, runtimePage);

      const topCourses = await collectAndRankTopCourses(
        runtimePage,
        keywordRow.keyword,
        {
          filters: DEFAULT_FILTERS,
          maxCourses: Math.min(cli.maxCoursesPerKeyword, 200),
          maxPages: cli.maxPages,
          throttleMs: cli.throttleMs
        },
        logger
      );

      finalRows.push(
        ...topCourses.map((course) => ({
          keyword: keywordRow.keyword,
          courseTitle: course.title,
          courseUrl: course.url,
          rating: course.rating ?? 0,
          ratingCount: course.ratingCount ?? 0
        }))
      );

      logger.info('Keyword processing completed', {
        keyword: keywordRow.keyword,
        visitedDetailPages: topCourses.length,
        eligibleCount: topCourses.length,
        exported: topCourses.length,
        durationMs: Date.now() - start
      });
    } catch (error) {
      logger.error('Keyword failed; continuing', {
        keyword: keywordRow.keyword,
        durationMs: Date.now() - start,
        error: String(error)
      });
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
