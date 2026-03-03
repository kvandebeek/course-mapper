export const DISALLOWED_TITLE_KEYWORDS = [
  'Exam Prep',
  'AWS',
  'InDesign',
  'Azure',
  'Google Cloud',
  'GCP',
  'Sigma',
  'Microservices',
  'SAP'
] as const;

export interface BlockedKeywordResult {
  readonly blocked: boolean;
  readonly matched?: string;
}

export function isBlockedByKeyword(title: string): BlockedKeywordResult {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  if (normalizedTitle.length === 0) {
    return { blocked: false };
  }

  for (const keyword of DISALLOWED_TITLE_KEYWORDS) {
    if (normalizedTitle.includes(keyword.toLocaleLowerCase())) {
      return {
        blocked: true,
        matched: keyword
      };
    }
  }

  return { blocked: false };
}
