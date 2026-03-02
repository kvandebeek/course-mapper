# Course Mapper: Udemy Business Course Discovery CLI

Course Mapper is a TypeScript command-line tool that discovers and ranks Udemy Business courses for a curated keyword list, then exports a CSV ready for curriculum planning and review.

## What this project does

- Reads raw keyword metadata from `keywords-list.csv`.
- Normalizes that keyword list into a deterministic machine-friendly file.
- Opens an authenticated browser session (Playwright) against your Udemy Business tenant.
- Scrapes search results for each keyword and fetches details for candidate courses.
- Filters/ranks courses using a transparent score model.
- Writes a final CSV (`artifacts/udemy/top_courses.csv`) with top matches.

## Architecture at a glance

1. **CLI orchestration** (`src/cli.ts`): parses flags, initializes session lifecycle, controls per-keyword workflow.
2. **Keyword pipeline** (`src/keywords/*`): normalization, freshness checks, and loading.
3. **Search + extraction** (`src/udemy/*`, `src/searchScraper.ts`): result page traversal + detail extraction.
4. **Ranking and filtering** (`src/filter.ts`, `src/scoring.ts`, `src/courseEnricher.ts`).
5. **Output** (`src/csvWriter.ts`) and structured logging (`src/logger.ts`).

## Prerequisites

- Node.js `>= 20.11.0`
- npm
- A Udemy Business account with access to your organization catalog
- First run in headed mode to complete SSO in a persistent profile

## Install

```bash
npm install
```

## Common commands

```bash
# Main scrape run
npm run scrape -- --headless=true --browserChannel=chrome --concurrency=1 --throttleMs=900 --maxPages=8

# First run (manual login)
npm run scrape -- --headless=false --profileDir=./artifacts/profile --browserChannel=chrome

# Normalize keywords only
npm run normalize-keywords

# Smoke check
npm run smoke

# Tests
npm test
```

## CLI options

- `--headless=true|false`
- `--debug=true|false`
- `--browserChannel=chrome|msedge|chromium`
- `--maxCoursesPerKeyword=<number>`
- `--maxPages=<number>`
- `--throttleMs=<number>`
- `--concurrency=<number>` *(currently pinned to safe sequential behavior in config parsing)*
- `--profileDir=<path>`
- `--keywordsFile=<path>`
- `--normalizedKeywordsFile=<path>`

Run `npm run scrape -- --help` for a quick runtime summary.

## Input and output

### Input

`keywords-list.csv` with headers:

```csv
track,level,moduleType,keyword
```

### Output

`artifacts/udemy/top_courses.csv` with at least:

- `keyword`
- `courseTitle`
- `courseUrl`
- `rating`
- `ratingCount`

## Reliability and anti-flake design

- Persistent browser context for SSO stability.
- Conservative throttling with jitter/backoff for rate-limit conditions.
- Defensive parsing for API payload shape drift.
- Navigation controls to keep scraper actions in one tab.
- Graceful per-keyword failure handling so one bad query does not fail the run.

## Troubleshooting

- **Not authenticated in headless mode**: run once with `--headless=false` and complete SSO.
- **Search temporarily unavailable**: reduce speed (`--concurrency=1`, increase `--throttleMs`, reduce `--maxPages`).
- **No rows exported**: validate keyword quality and account permissions in the tenant.
- **Browser channel errors**: install Chrome/Edge or use `--browserChannel=chromium`.

## Responsible use

Use this tooling within your organization’s approved automation policy and Udemy Business terms.
