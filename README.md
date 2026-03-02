# Udemy Business Top Courses Scraper (Resillion)

Production-ready Node.js + TypeScript CLI that scrapes the Resillion Udemy Business catalog and exports top courses per keyword to CSV.

## Overview
- Reads keyword mappings from `./input/keywords.csv`.
- Reuses a persisted Playwright browser profile for SSO-authenticated sessions.
- Uses Playwright `chromium` with `channel=chrome` by default to match a real Chrome runtime used by normal browsing.
- Scrapes search results with API sniffing, resilient response waits, and DOM fallback extraction.
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
npm run scrape -- --headless=false --profileDir=./artifacts/profile --browserChannel=chrome
```
If not authenticated, the CLI pauses and asks you to press ENTER after login succeeds.

## Recommended run flags
```bash
npm run scrape -- --headless=true --browserChannel=chrome --concurrency=1 --throttleMs=900 --maxPages=8
```
Recommended defaults for Udemy Business stability:
- `--browserChannel=chrome`
- `--concurrency=1`
- `--throttleMs` >= `700`
- conservative `--maxPages`

## CLI flags
- `--headless` (default: `false`)
- `--debug` (default: `false`)
- `--browserChannel` (default: `chrome`, allowed: `chrome|msedge|chromium`)
- `--maxCoursesPerKeyword` (default: `200`)
- `--maxPages` (default: `15`)
- `--throttleMs` (default: `300`, plus built-in jitter 400-1200ms)
- `--concurrency` (default: `1`)
- `--profileDir` (default: `./artifacts/profile`)

Use `--help` to print CLI help at runtime.

## Search resilience behavior
- Detects the UI error state `search is currently unavailable`.
- Retries page reload up to 3 times using exponential backoff + jitter.
- If still unavailable, skips the keyword gracefully and records `status=failed` + `failureReason` in CSV output.
- Stops pagination when unique result count does not increase.
- Uses network endpoint sniffing to avoid non-result endpoints (for example, `learning_path_folder` tags).
- Falls back to DOM extraction if API capture fails.

## Output CSV format
`./artifacts/udemy/top_courses.csv`

Columns:
- `track,level,moduleType,keyword,courseId,url,title,language,durationMinutes,udemyLevel,category,rating,ratingCount,score,status,failureReason`

## Troubleshooting
- **“Sorry, search is currently unavailable” appears**:
  - Likely rate limiting or anti-bot fingerprinting.
  - Run slower (`--concurrency=1`, higher `--throttleMs`, lower `--maxPages`).
  - Prefer `--browserChannel=chrome`.
  - Retry with a fresh profile directory and re-run SSO.
- **Chrome channel is missing**:
  - Install Chrome (or use `--browserChannel=msedge`).
  - Scraper logs a warning and falls back to Playwright Chromium automatically.
- **Login keeps failing in headless mode**:
  - run with `--headless=false` and complete SSO manually once.
- **Empty results**:
  - verify keyword relevance, account access, and that filters are not excluding all courses.

## Smoke check
Run lifecycle smoke check:
```bash
npm run smoke
```

## Compliance note
Use responsibly. Respect Udemy Business terms of use, organizational policies, and platform rate limits.
