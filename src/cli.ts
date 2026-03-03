/**
 * src/cli.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { rm } from 'node:fs/promises';
import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { createLogger } from './logger.js';
import { initAuthenticatedSession } from './auth.js';
import { ExportRow } from './types.js';
import { createSessionManager } from './runtime/sessionManager.js';
import { DEFAULT_FILTERS, collectAndRankTopCourses } from './udemy/scrapeKeyword.js';
import { enforceSameTabNavigation } from './udemy/navigation.js';
import { ensureNormalizedKeywords } from './keywords/ensureNormalizedKeywords.js';
import { loadNormalizedKeywords } from './keywords/loadNormalizedKeywords.js';
import { createIncrementalCsvWriter } from './io/incrementalCsvWriter.js';
import { initAllCoursesWriter } from './output/allCoursesWriter.js';
import { buildExportRow } from './results/buildExportRow.js';
import { parseCareerLevel, LEVEL_TO_INSTRUCTIONAL } from './levels/careerLevel.js';

/**
 * printHelp: internal utility for this module.
 */
function printHelp(): void {
  console.log(`Udemy Business scraper options:
  --headless=true|false
  --debug=true|false
  --browserChannel=chrome|msedge|chromium (default: chrome)
  --maxCoursesPerKeyword=<number>
  --maxPages=<number>
  --throttleMs=<number>
  --concurrency=<number> (default: 1)
  --profileDir=<path>
  --keywordsFile=<path> (default: ./keywords-list.csv)
  --normalizedKeywordsFile=<path> (default: ./artifacts/keywords.normalized.csv)
  --durations=<comma-separated buckets> (default: extraShort,short,medium,long)
  --allCoursesDedupe=none|perRun (default: none)`);
}

/**
 * main: internal utility for this module.
 */
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

  const keywordsFile = resolvePath(cli.keywordsFile ?? config.inputCsvPath);
  const normalizedKeywordsFile = resolvePath(cli.normalizedKeywordsFile ?? config.normalizedKeywordsCsvPath);

  logger.info('Keyword files', { keywordsFile, normalizedKeywordsFile });
  const ensureResult = await ensureNormalizedKeywords({
    sourceFile: keywordsFile,
    normalizedFile: normalizedKeywordsFile
  });

  if (ensureResult.regenerated) {
    logger.info('Normalized keywords regenerated', {
      normalizedKeywordsFile: ensureResult.normalizedFile,
      generatedRows: ensureResult.generatedCount
    });
  } else {
    logger.info('Normalized keywords are up-to-date', {
      normalizedKeywordsFile: ensureResult.normalizedFile
    });
  }

  const keywords = await loadNormalizedKeywords(normalizedKeywordsFile);
  logger.info('Loaded normalized keywords', { count: keywords.length });

  let session = await initAuthenticatedSession(sessionManager, config.baseUrl, config.orgHomePath, cli.headless, logger);

  try {
    const page = await session.ensurePage();
    enforceSameTabNavigation(session.context, page);

    const outputCsvPath = resolvePath(config.outputCsvPath);
    await rm(outputCsvPath, { force: true });
    const durations = cli.durations && cli.durations.length > 0 ? cli.durations : config.filters.durations;
    const writer = createIncrementalCsvWriter({
      outputFilePath: outputCsvPath,
      headers: ['track', 'level', 'moduleType', 'keyword', 'courseInstructionalLevel', 'courseTitle', 'courseUrl', 'rating', 'ratingCount', 'duration', 'durationTotalMinutes']
    });

    const allCoursesPath = resolvePath('./artifacts/udemy/all_courses.csv');
    const allCoursesWriter = await initAllCoursesWriter(allCoursesPath, { dedupeMode: cli.allCoursesDedupe ?? 'none' });
    const allCoursesCounts = {
      inspected: 0,
      accepted: 0,
      rejected: 0
    };

    logger.info('All courses audit log initialized', {
      path: allCoursesWriter.outputFilePath,
      mode: allCoursesWriter.fileExisted ? 'append' : 'created',
      dedupeMode: cli.allCoursesDedupe ?? 'none'
    });

    const finalRows: ExportRow[] = [];

    for (const keywordRow of keywords) {
      const start = Date.now();
      logger.info('Keyword processing started', { keyword: keywordRow.keyword });

      try {
        const careerLevel = parseCareerLevel(keywordRow.level);
        if (!careerLevel) {
          logger.warn('Keyword skipped: unable to parse career level', {
            keyword: keywordRow.keyword,
            level: keywordRow.level
          });
          continue;
        }

        const allowedInstructionalLevels = LEVEL_TO_INSTRUCTIONAL[careerLevel];
        logger.debug('Career level mapping resolved', {
          keyword: keywordRow.keyword,
          level: keywordRow.level,
          careerLevel,
          allowedInstructionalLevels
        });

        session = await sessionManager.getOrCreateSession();
        const runtimePage = await session.ensurePage();
        enforceSameTabNavigation(session.context, runtimePage);

        const topCourses = await collectAndRankTopCourses(
          runtimePage,
          keywordRow.keyword,
          careerLevel,
          {
            filters: { ...DEFAULT_FILTERS, durations },
            allowedInstructionalLevels,
            maxCourses: Math.min(cli.maxCoursesPerKeyword, 200),
            maxPages: cli.maxPages,
            throttleMs: cli.throttleMs,
            onCourseInspected: async (event) => {
              const appended = await allCoursesWriter.appendInspectedCourse({
                keyword: event.keyword,
                courseTitle: event.courseTitle,
                courseUrl: event.courseUrl,
                rating: event.rating ?? '',
                ratingCount: event.ratingCount ?? '',
                courseInstructionalLevel: event.courseInstructionalLevel,
                durationMinutes: event.durationMinutes ?? '',
                lastUpdated: event.lastUpdated,
                status: event.status,
                failureReason: event.failureReason
              });
              if (appended) {
                allCoursesCounts.inspected += 1;
              }
            },
            onCourseOutcome: async (event) => {
              const appended = await allCoursesWriter.appendInspectedCourse({
                keyword: event.keyword,
                courseTitle: event.courseTitle,
                courseUrl: event.courseUrl,
                rating: event.rating ?? '',
                ratingCount: event.ratingCount ?? '',
                courseInstructionalLevel: event.courseInstructionalLevel,
                durationMinutes: event.durationMinutes ?? '',
                lastUpdated: event.lastUpdated,
                status: event.status,
                failureReason: event.failureReason
              });
              if (!appended) {
                return;
              }
              if (event.status === 'accepted') {
                allCoursesCounts.accepted += 1;
              } else if (event.status === 'rejected') {
                allCoursesCounts.rejected += 1;
              }
            }
          },
          logger
        );

        for (const course of topCourses) {
          const row = buildExportRow(keywordRow, course);

          finalRows.push(row);

          try {
            await writer.appendRow(row);
            logger.debug('Wrote CSV row incrementally', {
              keyword: row.keyword,
              courseUrl: row.courseUrl,
              courseTitle: row.courseTitle
            });
          } catch (appendError) {
            logger.error('Failed to append CSV row; continuing', {
              keyword: row.keyword,
              courseUrl: row.courseUrl,
              courseTitle: row.courseTitle,
              error: String(appendError)
            });
          }
        }

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

    await allCoursesWriter.close();

    logger.info('All courses audit log summary', {
      path: allCoursesWriter.outputFilePath,
      inspectedRowsAppended: allCoursesCounts.inspected,
      acceptedRowsAppended: allCoursesCounts.accepted,
      rejectedRowsAppended: allCoursesCounts.rejected
    });

    logger.info('Run complete', {
      rows: finalRows.length,
      output: outputCsvPath,
      totalDurationMs: Date.now() - totalStart
    });
  } finally {
    await sessionManager.closeSession();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exitCode = 1;
});
