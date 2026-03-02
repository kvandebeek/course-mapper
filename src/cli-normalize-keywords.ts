import { getAppConfig, getCliOptions, resolvePath } from './config.js';
import { normalizeKeywordsFile } from './keywords/normalizeKeywords.js';

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
