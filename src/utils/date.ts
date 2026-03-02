/**
 * src/utils/date.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

/**
 * monthsSince: public helper used by other modules.
 */
export function monthsSince(dateInput: string, now: Date): number {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  const yearDiff = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * getNowInBrussels: public helper used by other modules.
 */
export function getNowInBrussels(): Date {
  const now = new Date();
  const localeString = now.toLocaleString('en-US', { timeZone: 'Europe/Brussels' });
  return new Date(localeString);
}
