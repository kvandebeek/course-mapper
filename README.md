# Course Mapper (Udemy Business Scraper)

Course Mapper is a TypeScript CLI that links career-framework keywords to Udemy Business courses, filters results using explicit quality gates, and exports traceable CSV artifacts.

## Technical Guide

### 1) Setup

- Node.js `>= 20.11.0`
- npm
- A Udemy Business tenant account with organization access
- First run should be headed (`--headless=false`) so SSO can be completed and stored in the profile directory

### 2) Installation

```bash
npm install
```

### 3) CLI usage

```bash
# Show help
npm run scrape -- --help

# Typical scrape run (sequential, throttled)
npm run scrape -- --headless=true --browserChannel=chrome --throttleMs=900 --maxPages=8

# First-run login bootstrap (manual SSO in browser)
npm run scrape -- --headless=false --profileDir=./artifacts/profile --browserChannel=chrome

# Normalize keywords only
npm run normalize:keywords

# Type check / tests
npm run typecheck
npm test
```

### 4) Configuration and flags

Supported runtime flags:

- `--headless=true|false`
- `--debug=true|false`
- `--browserChannel=chrome|msedge|chromium`
- `--maxCoursesPerKeyword=<number>`
- `--maxPages=<number>`
- `--throttleMs=<number>`
- `--concurrency=<number>` *(currently parsed but effectively forced to sequential behavior)*
- `--profileDir=<path>`
- `--keywordsFile=<path>`
- `--normalizedKeywordsFile=<path>`
- `--durations=<comma-separated buckets>` where buckets are `extraShort,short,medium,long,extraLong`
- `--allCoursesDedupe=none|perRun`

App defaults (from config):

- base URL: `https://resillion.udemy.com`
- org home path: `/organization/home/`
- default thresholds: min rating `4.6`, min rating count `5000`
- default duration filters: `extraShort,short,medium,long`

### 5) Inputs

Primary source CSV (default `keywords-list.csv`) uses headers:

```csv
Track,Level,Core Modules,AI Modules,Softskills
```

Normalized artifact (default `artifacts/keywords.normalized.csv`) uses:

```csv
track,level,levelCodes,moduleType,keyword
```

### 6) Outputs

#### `artifacts/udemy/top_courses.csv`

Final shortlisted courses:

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

#### `artifacts/udemy/all_courses.csv`

Audit/trace log of inspected outcomes:

- `runId`
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

### 7) Folder structure

- `src/cli.ts` — main orchestration
- `src/config.ts` — CLI parsing + defaults
- `src/keywords/*` — keyword normalization/loading
- `src/levels/*` — career-level to instructional-level mappings
- `src/udemy/*` — navigation, search, detail extraction, keyword scrape pipeline
- `src/io/*` and `src/output/*` — incremental/audit CSV writers
- `src/results/*` — export row shaping
- `src/runtime/*` — Playwright session/context management
- `src/utils/*` — retry/throttle/time helpers
- `artifacts/` — runtime outputs, debug files, profile persistence

### 8) Pipeline flow (high-level)

1. Parse CLI and load app defaults.
2. Ensure normalized keyword file exists and is fresh.
3. Start/reuse persistent browser session and verify authentication.
4. For each normalized keyword:
   - derive allowed instructional levels from career level,
   - run keyword searches (per instructional level),
   - collect candidate course URLs,
   - open course detail pages and extract fields,
   - apply filters (blocked keyword, rating, rating count),
   - score and rank accepted candidates,
   - append shortlist/audit rows incrementally.
5. Close writers/session and emit run summary logs.

### 9) Operational notes

- If headless auth fails, rerun with `--headless=false` and complete SSO.
- Throttling and backoff are intentional for anti-blocking stability.
- Debug artifacts are emitted on failures under `artifacts/debug` and `artifacts/nav_failures`.

---

## For HR, Sales, and Management

This tool helps turn your career framework into a practical course shortlist.

### What it does

It reads your role/level keywords, searches Udemy Business for matching courses, removes weak or off-topic results, and creates a clean shortlist plus a trace file that explains what was accepted or rejected.

### Why it exists

Manually searching courses for every role and level is slow and inconsistent. This tool makes the process faster, repeatable, and easier to audit.

### Problem it solves

It closes the gap between:

- a career framework (roles, levels, modules), and
- concrete learning content teams can assign and review.

### How it connects courses to the career framework

- Input keywords come from your career framework structure.
- Each keyword is linked to a track, level, and module type.
- The system searches and filters courses for that exact context.
- Output rows keep that mapping so every course is traceable back to framework intent.

### How this supports each function

- **HR:** supports clearer career progression alignment by level and module type.
- **Sales:** improves visibility of capability-building content tied to role expectations.
- **Management:** supports planning and gap analysis with a consistent shortlist process.

### Inputs, processing, outputs

- **Inputs:** career-framework keywords from CSV.
- **Processing:** search, filtering, level mapping, and ranking.
- **Outputs:** shortlisted courses and a full inspected-course audit trail.

### How to interpret results

- The shortlist is a high-confidence starting point, not a final approval list.
- Use audit output to understand rejections and tune keywords when needed.

### Recommended run frequency

- Run on a regular cadence (for example monthly or each curriculum planning cycle).
- Re-run after major framework updates or when launching new skill tracks.

### What it does NOT do

- It does not replace human curriculum judgment.
- It does not guarantee business fit for every accepted course.
- It does not automatically assign courses to learners.
