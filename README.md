# Udemy Business Top Courses Scraper (Resillion)

Production-ready Node.js + TypeScript CLI that scrapes the Resillion Udemy Business catalog and exports top 3 eligible courses per keyword to CSV.

## Overview
- Reads keyword mappings from `./input/keywords.csv`.
- Reuses a persisted Playwright browser profile for SSO-authenticated sessions.
- Uses deterministic URL-driven navigation (`page.goto`) for search and course pages (no UI clicks).
- Enforces same-tab behavior by closing unexpected tabs/popups.
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

## Authentication workflow (persistent profileDir + manual SSO)
The scraper launches a persistent browser context using `--profileDir`.

On first run, use headed mode and complete SSO manually once:
```bash
npm run scrape -- --headless=false --profileDir=./artifacts/profile --browserChannel=chrome
```
If not authenticated, the CLI pauses and asks you to press ENTER after login succeeds. Cookies/session are then reused in later runs from the same `profileDir`.

## URL-driven search parameters
Supported query params on `/organization/search/`:
- `src=ukw`
- `q=<keyword>`
- `ratings=<number>`
- `lang=<code>`
- `instructional_level=<all|beginner|intermediate|expert>` (repeatable)
- `sort=<highest-rated|most-reviewed|relevance|newest>`

Examples:
- `https://resillion.udemy.com/organization/search/?src=ukw&q=testing&ratings=4.5&lang=en`
- `https://resillion.udemy.com/organization/search/?src=ukw&q=testing&ratings=4.5&lang=en&instructional_level=beginner&instructional_level=intermediate&instructional_level=expert`
- `https://resillion.udemy.com/organization/search/?src=ukw&q=informatics&sort=most-reviewed`

## Default pre-filters and eligibility rules
Default URL pre-filters:
- `ratings=4.5`
- `lang=en`
- `sort=most-reviewed`

Final eligibility (from detail extraction):
- rating `>= 4.4`
- ratingCount `>= 1500`
- `lastUpdateDate` within the last 36 months

## CLI flags
- `--headless` (default: `false`)
- `--debug` (default: `false`)
- `--browserChannel` (default: `chrome`, allowed: `chrome|msedge|chromium`)
- `--maxCoursesPerKeyword` (default: `200`, capped at 200)
- `--maxPages` (default: `15`)
- `--throttleMs` (accepted for backward compatibility)
- `--concurrency` (accepted for backward compatibility)
- `--profileDir` (default: `./artifacts/profile`)

Use `--help` to print CLI help at runtime.

## Output CSV format
`./artifacts/udemy/top_courses.csv`

Columns:
- `keyword,courseTitle,courseUrl,rating,ratingCount,lastUpdateDate,publishedDate,instructors,courseId`

## Diagnostics and failure artifacts
On navigation/extraction failures, artifacts are saved under `artifacts/nav_failures/`:
- screenshot (`.png`)
- page HTML dump (`.html`)
- context text (`.txt`) with URL, keyword, and error

## Compliance note
Use responsibly. Respect Udemy Business terms of use, organizational policies, and platform rate limits.
