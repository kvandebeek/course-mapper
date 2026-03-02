# Udemy Business Top Courses Scraper (Resillion)

Production-ready Node.js + TypeScript CLI that scrapes the Resillion Udemy Business catalog and exports top courses per keyword to CSV.

## Overview
- Reads keyword mappings from `./input/keywords.csv`.
- Reuses a persisted Playwright browser profile for SSO-authenticated sessions.
- Scrapes search results, enriches each course from Udemy API responses, filters courses, scores them, and writes top 3 per keyword.
- Output CSV: `./artifacts/udemy/top_courses.csv`

## Setup
1. Install Node.js `>=20.11.0`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Ensure input file exists:
   - `./input/keywords.csv`
   - Headers: `track,level,moduleType,keyword`

## First run (manual SSO, headed)
Use headed mode and complete SSO in the opened browser profile:
```bash
npm run scrape -- --headless=false --profileDir=./artifacts/profile
```
If not authenticated, the CLI pauses and asks you to press ENTER after login succeeds.

## Subsequent runs (headless)
Once the profile is persisted:
```bash
npm run scrape -- --headless=true --profileDir=./artifacts/profile
```

## CLI flags
- `--headless` (default: `false`)
- `--debug` (default: `false`)
- `--maxCoursesPerKeyword` (default: `200`)
- `--maxPages` (default: `15`)
- `--throttleMs` (default: `300`)
- `--concurrency` (default: `2`, capped at 2)
- `--profileDir` (default: `./artifacts/profile`)

Example:
```bash
npm run scrape -- --headless=true --maxPages=20 --throttleMs=400 --concurrency=2
```

## Filtering rules
A course is included only if:
- Locale is English (`en`, `en_US`, `en_GB`)
- `rating >= 4.4`
- `ratingCount >= 1500`
- `lastUpdated` exists and is within the last 36 months (Europe/Brussels reference timezone)

## Scoring
For each remaining course:

```text
score = rating * 10 + log10(ratingCount + 1) * 5 + freshnessBonus
```

Freshness bonus:
- `+5` if updated within 12 months
- `+3` if within 24 months
- `+1` if within 36 months

Top 3 by score are kept per keyword.

## Input CSV format
`./input/keywords.csv`

Required columns:
- `track`
- `level`
- `moduleType`
- `keyword`

Each keyword row is applied to all exported courses found for that keyword.

## Output CSV format
`./artifacts/udemy/top_courses.csv`

Columns:
- `track,level,moduleType,keyword,courseId,url,title,instructors,language,durationMinutes,udemyLevel,category,rating,ratingCount,lastUpdated,score`

## Determinism and resilience
- Uses explicit page load states (`domcontentloaded`, `networkidle`) rather than arbitrary sleeps for navigation.
- Uses bounded retries (max 2) for transient failures.
- Throttles between pages (`--throttleMs`).
- Continues per-keyword on failures; one keyword failure will not abort the run.
- Structured logs include timings per keyword and run total.


## Session lifecycle
- Runtime uses a `RuntimeSession` abstraction to track context close and browser disconnect events without calling `BrowserContext.isClosed()` (not available in Playwright).
- A single `getOrCreateSession()` path reuses healthy persistent sessions and recreates closed/disconnected ones with an in-process creation lock.
- Manual SSO behavior remains deterministic: headed login waits for ENTER and does not auto-close your profile mid-run.

## Smoke check
Run a lightweight lifecycle smoke check:
```bash
npm run smoke
```
This validates create -> reuse -> close -> recreate flow for persistent sessions.

## Troubleshooting
- **Login keeps failing in headless mode**: run with `--headless=false` and complete SSO manually once.
- **Empty results**: verify keyword relevance, account access, and that filters are not excluding all courses.
- **Rate limiting / unstable pages**: increase `--throttleMs` and reduce `--maxPages`.
- **Profile corruption**: delete `./artifacts/profile` and repeat first-run login.

## Compliance note
Use responsibly. Respect Udemy Business terms of use, organizational policies, and platform rate limits.
