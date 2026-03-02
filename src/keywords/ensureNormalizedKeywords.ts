import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { normalizeKeywordsFile } from './normalizeKeywords.js';

interface EnsureNormalizedKeywordsParams {
  readonly sourceFile: string;
  readonly normalizedFile: string;
}

export async function ensureNormalizedKeywords(params: EnsureNormalizedKeywordsParams): Promise<{ readonly regenerated: boolean; readonly normalizedFile: string; readonly generatedCount: number; }> {
  const sourcePath = path.resolve(params.sourceFile);
  const normalizedPath = path.resolve(params.normalizedFile);

  let shouldRegenerate = false;

  try {
    const [sourceStat, normalizedStat] = await Promise.all([stat(sourcePath), stat(normalizedPath)]);
    if (sourceStat.mtimeMs > normalizedStat.mtimeMs) {
      shouldRegenerate = true;
    }
  } catch {
    shouldRegenerate = true;
  }

  if (!shouldRegenerate) {
    return {
      regenerated: false,
      normalizedFile: normalizedPath,
      generatedCount: 0
    };
  }

  const normalized = await normalizeKeywordsFile({
    sourceFile: sourcePath,
    outputFile: normalizedPath
  });

  return {
    regenerated: true,
    normalizedFile: normalized.writtenTo,
    generatedCount: normalized.rows.length
  };
}
