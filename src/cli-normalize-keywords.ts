/**
 * src/cli-normalize-keywords.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { normalizeKeywordsFile } from './keywords/normalizeKeywords.js';

/**
 * main: internal utility for this module.
 */
async function main(): Promise<void> {
  const cli = getCliOptions(process.argv);
  const config = getAppConfig();

  const keywordsFile = resolvePath(cli.keywordsFile ?? config.inputCsvPath);
  const normalizedKeywordsFile = resolvePath(cli.normalizedKeywordsFile ?? config.normalizedKeywordsCsvPath);

  const result = await normalizeKeywordsFile({
    sourceFile: keywordsFile,
    outputFile: normalizedKeywordsFile
  });

  console.log(`Normalized keywords generated: ${result.rows.length}`);
  console.log(`Source: ${keywordsFile}`);
  console.log(`Output: ${result.writtenTo}`);
}

main().catch((error) => {
  console.error('Failed to normalize keywords:', error);
  process.exitCode = 1;
});
