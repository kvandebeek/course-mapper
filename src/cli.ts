import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { createLogger } from './logger.js';
import { loadKeywords } from './keywordLoader.js';
import { initAuthenticatedSession } from './auth.js';
import { scrapeKeywordCourses, SearchRuntime } from './searchScraper.js';
import { enrichCourses } from './courseEnricher.js';
import { filterCourses } from './filter.js';
import { scoreAndSelectTopThree } from './scoring.js';
import { writeOutputCsv } from './csvWriter.js';
import { CourseScored } from './types.js';

async function main(): Promise<void> {
  const cli = getCliOptions(process.argv);
  const config = getAppConfig();
  const logger = createLogger(cli.debug);
  const totalStart = Date.now();

  logger.info('Starting scraper', { cli });

  const keywords = await loadKeywords(resolvePath(config.inputCsvPath));
  logger.info('Loaded keywords', { count: keywords.length });

  const initialSession = await initAuthenticatedSession(
    cli.profileDir,
    config.baseUrl,
    config.orgHomePath,
    cli.headless,
    logger
  );

  const runtime: SearchRuntime = {
    context: initialSession.context,
    page: initialSession.page
  };

  const finalRows: CourseScored[] = [];

  for (const keywordRow of keywords) {
    const start = Date.now();
    try {
      logger.info('Processing keyword', { keyword: keywordRow.keyword });

      if (runtime.context.isClosed()) {
        logger.warn('Search context was closed; recreating authenticated session');
        const replacement = await initAuthenticatedSession(
          cli.profileDir,
          config.baseUrl,
          config.orgHomePath,
          cli.headless,
          logger
        );
        runtime.context = replacement.context;
        runtime.page = replacement.page;
      }

      const searchResults = await scrapeKeywordCourses(runtime, config.baseUrl, keywordRow.keyword, {
        maxCoursesPerKeyword: cli.maxCoursesPerKeyword,
        maxPages: cli.maxPages,
        throttleMs: cli.throttleMs
      }, logger);

      const enriched = await enrichCourses(runtime.context, keywordRow.keyword, searchResults, cli.concurrency, logger);
      const filtered = filterCourses(enriched, config);
      const topThree = scoreAndSelectTopThree(filtered, keywordRow);
      finalRows.push(...topThree);

      logger.info('Keyword complete', {
        keyword: keywordRow.keyword,
        fetched: searchResults.length,
        filtered: filtered.length,
        exported: topThree.length,
        durationMs: Date.now() - start
      });
    } catch (error) {
      logger.error('Keyword failed; continuing', {
        keyword: keywordRow.keyword,
        durationMs: Date.now() - start,
        error: String(error)
      });

      if (String(error).toLowerCase().includes('context') || runtime.context.isClosed()) {
        try {
          const replacement = await initAuthenticatedSession(
            cli.profileDir,
            config.baseUrl,
            config.orgHomePath,
            cli.headless,
            logger
          );
          runtime.context = replacement.context;
          runtime.page = replacement.page;
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

  if (!cli.debug && !runtime.context.isClosed()) {
    await runtime.context.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
