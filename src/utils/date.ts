export function monthsSince(dateInput: string, now: Date): number {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  const yearDiff = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  return yearDiff * 12 + monthDiff;
}

export function getNowInBrussels(): Date {
  const now = new Date();
  const localeString = now.toLocaleString('en-US', { timeZone: 'Europe/Brussels' });
  return new Date(localeString);
}
