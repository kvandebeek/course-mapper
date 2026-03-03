/**
 * src/types.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

export interface CliOptions {
  headless: boolean;
  debug: boolean;
  browserChannel: BrowserChannel;
  maxCoursesPerKeyword: number;
  maxPages: number;
  throttleMs: number;
  concurrency: number;
  profileDir: string;
  keywordsFile?: string;
  normalizedKeywordsFile?: string;
}

export type BrowserChannel = 'chrome' | 'msedge' | 'chromium';

export interface AppConfig {
  baseUrl: string;
  orgHomePath: string;
  inputCsvPath: string;
  normalizedKeywordsCsvPath: string;
  outputCsvPath: string;
  englishLocales: ReadonlySet<string>;
  minRating: number;
  minRatingCount: number;
}

export type ModuleType = 'core' | 'ai' | 'softskills';

export interface KeywordRow {
  readonly track: string;
  readonly level: string;
  readonly levelCodes: readonly string[];
  readonly moduleType: ModuleType;
  readonly keyword: string;
}

export type ExportRow = {
  readonly track: string;
  readonly level: string;
  readonly moduleType: ModuleType;
  readonly keyword: string;
  readonly courseInstructionalLevel: 'all' | 'beginner' | 'intermediate' | 'expert';
  readonly courseTitle: string;
  readonly courseUrl: string;
  readonly rating: number;
  readonly ratingCount: number;
};

export interface CourseRaw {
  keyword: string;
  courseId: string;
  url: string;
  title: string;
  language: string;
  durationMinutes: number | null;
  udemyLevel: string | null;
  category: string | null;
  rating: number | null;
  ratingCount: number | null;
  badges: string[];
}

export interface CourseScored extends CourseRaw {
  track: string;
  level: string;
  moduleType: ModuleType;
  score: number;
  failureReason?: string;
}

export interface SearchResultPayload {
  id: string;
  url: string;
  title: string;
  locale: string;
  rating: number | null;
  ratingCount: number | null;
  level: string | null;
}
