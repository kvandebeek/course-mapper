# Course Mapper (Technical README)

Course Mapper is a TypeScript CLI that maps career-framework keywords to Udemy Business courses. It automates keyword normalization, Udemy search navigation, course detail extraction, filtering, scoring, and CSV export so teams can run a repeatable pipeline instead of manual searching.

The runtime is intentionally conservative: one keyword at a time, explicit rejection reasons, and incremental CSV writes for traceability. Accepted courses are exported to `top_courses.csv`, while all inspected outcomes are appended to `all_courses.csv` for audit and future review.

## Prerequisites

- Node.js `>=20.11.0` (from `package.json` engines)
- npm
- A Udemy Business org account (this repo defaults to `https://resillion.udemy.com`)
- Playwright browser binaries installed via dependency install (`playwright` package)
- First login should generally be headed (`--headless=false`) to complete SSO and persist profile state

## Install

```bash
npm install
```

## Main commands

```bash
# Run scraper
npm run scrape -- --headless=true --browserChannel=chrome --throttleMs=900 --maxPages=8

# First-time SSO bootstrap (headed)
npm run scrape -- --headless=false --profileDir=./artifacts/profile --browserChannel=chrome

# Normalize keywords only
npm run normalize:keywords

# Typecheck and tests
npm run typecheck
npm test
```

## CLI flags

- `--headless=true|false`
- `--debug=true|false`
- `--browserChannel=chrome|msedge|chromium`
- `--maxCoursesPerKeyword=<number>` (runtime hard cap also enforces max 200)
- `--maxPages=<number>`
- `--throttleMs=<number>`
- `--concurrency=<number>` (currently parsed but forced to sequential behavior)
- `--profileDir=<path>`
- `--keywordsFile=<path>` (default source: `./keywords-list.csv`)
- `--normalizedKeywordsFile=<path>` (default normalized artifact: `./artifacts/keywords.normalized.csv`)
- `--durations=<comma-separated>` where each value is one of `extraShort,short,medium,long,extraLong`
- `--allCoursesDedupe=none|perRun`

## Input configuration

### Source keyword CSV
Default file: `keywords-list.csv` (overridable via `--keywordsFile`)

Expected columns:

```csv
Track,Level,Core Modules,AI Modules,Softskills
```

Behavior:
- `Core Modules`, `AI Modules`, `Softskills` are split by comma into individual keywords.
- Empty `Track` cells inherit the previous non-empty track.
- Header aliases are normalized (minor casing/spacing variation tolerated).
- Output is deduplicated and sorted deterministically.

### Normalized keyword CSV
Generated/read at `artifacts/keywords.normalized.csv` by default:

```csv
track,level,levelCodes,moduleType,keyword
```

## Search/filter behavior

- Base URL: `https://resillion.udemy.com/organization/search/`
- Query params include keyword plus filters such as `ratings`, `lang`, `duration`, `instructional_level`, `sort`.
- Default search filters in runtime:
  - min rating param: `4.6`
  - language: `en`
  - durations: `extraShort,short,medium,long`
  - sort: `relevance`
- Career-level to instructional-level mapping:
  - A1/A2 -> beginner
  - B1 -> beginner, intermediate
  - B2/C1 -> intermediate
  - C2 -> intermediate, expert
  - D1/D2/D3/E1/E2 -> expert
- Blocked title keywords are matched case-insensitively via normalized substring matching.
- Acceptance gates after detail extraction:
  - `rating >= 4.6`
  - `ratingCount >= 1000`

## Outputs

### `artifacts/udemy/top_courses.csv`
- Recreated each run.
- Incrementally appended while processing accepted courses.
- Columns (stable order):
  - `track`
  - `level`
  - `moduleType`
  - `keyword`
  - `courseInstructionalLevel`
  - `courseTitle`
  - `courseUrl`
  - `rating`
  - `ratingCount`
  - `duration`
  - `durationTotalMinutes`

### `artifacts/udemy/all_courses.csv`
- Append-oriented audit/history file.
- Records inspected, accepted, and rejected outcomes.
- If an existing file has a header mismatch, writer creates `all_courses_v2.csv`.
- Columns:
  - `timeAdded`
  - `keyword`
  - `courseTitle`
  - `courseUrl`
  - `rating`
  - `ratingCount`
  - `courseInstructionalLevel`
  - `durationMinutes`
  - `lastUpdated`
  - `status` (`inspected|accepted|rejected`)
  - `failureReason`

## Determinism and reliability notes

- Runtime is sequential for stability.
- URL canonicalization strips query/hash before dedupe.
- Incremental writers serialize appends per file to avoid line interleaving.
- Playwright session uses persistent context/profile and same-tab enforcement (popups/new tabs are closed).
- Throttle wrapper applies jitter and bounded retry/backoff for rate-limit-like failures (403/429/etc).

## Common failure modes and troubleshooting

- **Not authenticated in headless mode**
  - Run once with `--headless=false`, complete SSO, then rerun headless.
- **Search page unavailable/transient anti-bot behavior**
  - Increase `--throttleMs`, reduce `--maxPages`, retry run.
- **No search results found for keyword**
  - Check keyword quality and blocked-title policy overlap.
  - Inspect artifacts in `artifacts/nav_failures` and `artifacts/debug`.
- **Audit CSV schema changed from prior run format**
  - Writer automatically switches to `_v2`; consume newest file path from logs.

