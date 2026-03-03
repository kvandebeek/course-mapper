# Engineering Decisions Log

This document captures architecture and behavior decisions inferred from the current implementation.

## Architecture overview

- The runtime entrypoint is `src/cli.ts`, which orchestrates normalization, session bootstrap, keyword iteration, scraping, filtering, and CSV writing.
- Keyword preparation is split into:
  - source normalization (`src/keywords/normalizeKeywords.ts`),
  - freshness/regen checks (`src/keywords/ensureNormalizedKeywords.ts`),
  - normalized loading (`src/keywords/loadNormalizedKeywords.ts`).
- Scraping uses two paths:
  - main production path: `src/udemy/scrapeKeyword.ts` + `src/udemy/extractCourseDetail.ts`,
  - API-first search helper path: `src/searchScraper.ts` (used for reusable extraction helpers and diagnostics).
- Output is separated into:
  - shortlist export: `artifacts/udemy/top_courses.csv` (incremental append writer),
  - trace/audit export: `artifacts/udemy/all_courses.csv`.

## Scraping strategy

- Search runs are performed per keyword and per allowed instructional level.
- Search URLs are built with explicit filters (`lang`, `duration`, `instructional_level`, `sort`).
- Candidate discovery is URL-based (`/course/` links), canonicalized and deduplicated by full URL without query/hash.
- Candidate detail extraction is done on detail pages and merged with eligibility/ranking outcomes.

## Throttling and anti-blocking strategy

- Navigation and load-more interactions use jittered sleep + bounded retry behavior (`throttled`, `gotoWithRetries`).
- Rate-limit and anti-bot indicators (403/429/"forbidden" variants) trigger backoff.
- Search-unavailable pages are retried with exponential delay.
- Diagnostic artifacts are written for navigation/extraction failures under `artifacts/nav_failures` and `artifacts/debug`.

## Filtering philosophy

- Filtering is intentionally strict and explicit:
  - blocked-title keyword list excludes known out-of-scope content,
  - minimum rating threshold,
  - minimum rating-count threshold.
- Rejections are logged with stable machine-readable reasons where possible (`blocked_keyword`, `rating_below_min`, `rating_count_below_min`, etc.).
- Instructional level constraints are primarily enforced at search URL stage and carried forward via keyword-level mapping.

## CSV schema decisions

- `top_courses.csv` contains the final shortlist columns required by the downstream mapping process.
- `all_courses.csv` contains trace rows for inspected/accepted/rejected course states.
- Incremental writing is used for both robustness and partial-run visibility.

## Traceability decisions

- Every keyword run emits start/end logs.
- Every inspected candidate can emit an audit row with status + failure reason.
- Per-run `runId` is included in all-courses audit output to correlate results with a specific execution.

## Intentional field minimization

- The shortlist export keeps a compact set of fields (track/level/moduleType/keyword/instructional-level/title/url/rating/ratingCount/duration).
- Non-essential scraping fields are intentionally kept out of shortlist output and, when needed, are instead available in logs/artifacts.

## Determinism strategy

- Determinism relies on:
  - normalized keyword CSV generation with stable ordering,
  - deterministic URL canonicalization and dedupe,
  - ordered instructional-level mapping,
  - serialized CSV writes per file path.
- Timing randomness (jitter) affects runtime duration, not schema or filtering rules.

## Observability and logging strategy

- Logs are structured as timestamped level-tagged lines with optional JSON metadata.
- Throttle/backoff/sleep events are explicitly logged via utility wrappers.
- Rejection reasons are logged at filtering decision points.
- Failure diagnostics include screenshots, traces, HTML dumps, and href dumps where applicable.

## 2026-03-03 — Newly inferred/confirmed implementation decisions

- `--concurrency` is intentionally accepted but runtime behavior is effectively sequential (`1`) for stability.
- `--durations` defaults to `extraShort,short,medium,long` when omitted.
- Normalized keyword artifacts are regenerated only when missing or older than source keyword CSV.
- `all_courses.csv` supports optional per-run dedupe (`none` or `perRun`) keyed by `keyword|courseUrl|status`.

## Open issues / Follow-ups

1. **CLI/help mismatch risk:** CLI help suggests user-provided `--concurrency` is meaningful, but parser pins it to `1`.
2. **Output schema wording drift risk:** documentation in older revisions may describe “minimal five-column output,” while current export includes additional course detail columns.
3. **Tenant configurability gap:** base URL and org home path are hardcoded in app config rather than fully externalized.
4. **Artifact retention policy gap:** debug/nav-failure artifacts are written but lifecycle/cleanup policy is not encoded in tooling.
5. **Potential duplicate warning logs:** warning status logging in API candidate inspection appears to emit duplicate lines for a single event in `searchScraper`.
