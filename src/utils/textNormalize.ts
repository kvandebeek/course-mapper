const MATCH_LOCALE = 'en-US';

/**
 * Canonical normalization for keyword/title matching.
 */
export function normalizeForMatch(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase(MATCH_LOCALE)
    .replace(/\s+/g, ' ');
}

/**
 * Substring-based blocked-keyword check using canonical normalization.
 */
export function includesBlockedKeyword(haystack: string, blocked: readonly string[]): boolean {
  const normalizedHaystack = normalizeForMatch(haystack);
  if (!normalizedHaystack) {
    return false;
  }

  for (const blockedKeyword of blocked) {
    const normalizedBlockedKeyword = normalizeForMatch(blockedKeyword);
    if (normalizedBlockedKeyword.length === 0) {
      continue;
    }
    if (normalizedHaystack.includes(normalizedBlockedKeyword)) {
      return true;
    }
  }

  return false;
}

